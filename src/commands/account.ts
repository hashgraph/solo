/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import chalk from 'chalk'
import { BaseCommand } from './base.ts'
import { SoloError, IllegalArgumentError } from '../core/errors.ts'
import { flags } from './index.ts'
import { Listr } from 'listr2'
import * as prompts from './prompts.ts'
import { constants } from '../core/index.ts'
import { type AccountId, AccountInfo, HbarUnit, PrivateKey } from '@hashgraph/sdk'
import { FREEZE_ADMIN_ACCOUNT } from '../core/constants.ts'
import { type AccountManager } from '../core/account_manager.ts'
import { type Opts } from '../types/index.js'

export class AccountCommand extends BaseCommand {
  private readonly accountManager: AccountManager
  private accountInfo: {
    accountId: string,
    balance: number,
    publicKey: string,
    privateKey?: string
    accountAlias?: string
  } | null
  private readonly systemAccounts: number[][]

  constructor (opts: Opts, systemAccounts = constants.SYSTEM_ACCOUNTS) {
    super(opts)

    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager as any)

    this.accountManager = opts.accountManager
    this.accountInfo = null
    this.systemAccounts = systemAccounts
  }

  async closeConnections () {
    await this.accountManager.close()
  }

  async buildAccountInfo (accountInfo: AccountInfo, namespace: string, shouldRetrievePrivateKey: boolean) {
    if (!accountInfo || !(accountInfo instanceof AccountInfo)) throw new IllegalArgumentError('An instance of AccountInfo is required')

    const newAccountInfo: { accountId: string; balance: number; publicKey: string, privateKey?: string} = {
      accountId: accountInfo.accountId.toString(),
      publicKey: accountInfo.key.toString(),
      balance: accountInfo.balance.to(HbarUnit.Hbar).toNumber()
    }

    if (shouldRetrievePrivateKey) {
      const accountKeys = await this.accountManager.getAccountKeysFromSecret(newAccountInfo.accountId, namespace)
      newAccountInfo.privateKey = accountKeys.privateKey
    }

    return newAccountInfo
  }

  async createNewAccount (ctx: { config: { ecdsaPrivateKey?: string; privateKey?: string; namespace: string;
    setAlias: boolean; amount: number}; privateKey: PrivateKey; }) {
    if (ctx.config.ecdsaPrivateKey) {
      ctx.privateKey = PrivateKey.fromStringECDSA(ctx.config.ecdsaPrivateKey)
    } else if (ctx.config.privateKey) {
      ctx.privateKey = PrivateKey.fromStringED25519(ctx.config.privateKey)
    } else {
      ctx.privateKey = PrivateKey.generateED25519()
    }

    return await this.accountManager.createNewAccount(ctx.config.namespace,
      ctx.privateKey, ctx.config.amount, ctx.config.ecdsaPrivateKey ? ctx.config.setAlias : false)
  }

  getAccountInfo (ctx: { config: { accountId: string } }) {
    return this.accountManager.accountInfoQuery(ctx.config.accountId)
  }

  async updateAccountInfo (ctx: any) {
    let amount = ctx.config.amount
    if (ctx.config.privateKey) {
      if (!(await this.accountManager.sendAccountKeyUpdate(ctx.accountInfo.accountId, ctx.config.privateKey, ctx.accountInfo.privateKey))) {
        this.logger.error(`failed to update account keys for accountId ${ctx.accountInfo.accountId}`)
        return false
      }
    } else {
      amount = amount || flags.amount.definition.defaultValue
    }

    const hbarAmount = Number.parseFloat(amount)
    if (amount && isNaN(hbarAmount)) {
      throw new SoloError(`The HBAR amount was invalid: ${amount}`)
    }

    if (hbarAmount > 0) {
      if (!(await this.transferAmountFromOperator(ctx.accountInfo.accountId, hbarAmount))) {
        this.logger.error(`failed to transfer amount for accountId ${ctx.accountInfo.accountId}`)
        return false
      }
      this.logger.debug(`sent transfer amount for account ${ctx.accountInfo.accountId}`)
    }
    return true
  }

  async transferAmountFromOperator (toAccountId: AccountId, amount: number) {
    return await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, toAccountId, amount)
  }

  async init (argv: any) {
    const self = this

    interface Context {
      config: {
        namespace: string
      };
      updateSecrets: boolean
      accountsBatchedSet: number[][]
      resultTracker: {
        rejectedCount: number;
        fulfilledCount: number;
        skippedCount: number;
      }
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace
          ])

          const config = {
            namespace: <string>self.configManager.getFlag<string>(flags.namespace)
          }

          if (!await this.k8.hasNamespace(config.namespace)) {
            throw new SoloError(`namespace ${config.namespace} does not exist`)
          }

          // set config in the context for later tasks to use
          ctx.config = config

          self.logger.debug('Initialized config', { config })

          await self.accountManager.loadNodeClient(ctx.config.namespace)
        }
      },
      {
        title: 'Update special account keys',
        task: (_, task) => {
          return new Listr([
            {
              title: 'Prepare for account key updates',
              task: async (ctx) => {
                const secrets = await self.k8.getSecretsByLabel(['solo.hedera.com/account-id'])
                ctx.updateSecrets = secrets.length > 0

                ctx.accountsBatchedSet = self.accountManager.batchAccounts(this.systemAccounts)

                ctx.resultTracker = {
                  rejectedCount: 0,
                  fulfilledCount: 0,
                  skippedCount: 0
                }

                // do a write transaction to trigger the handler and generate the system accounts to complete genesis
                await self.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, FREEZE_ADMIN_ACCOUNT, 1)
              }
            },
            {
              title: 'Update special account key sets',
              task: (ctx) => {
                const subTasks: any[] = []
                const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
                const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard
                for (const currentSet of ctx.accountsBatchedSet) {
                  const accStart = `${realm}.${shard}.${currentSet[0]}`
                  const accEnd = `${realm}.${shard}.${currentSet[currentSet.length - 1]}`
                  const rangeStr = accStart !== accEnd ? `${chalk.yellow(accStart)} to ${chalk.yellow(accEnd)}` : `${chalk.yellow(accStart)}`
                  subTasks.push({
                    title: `Updating accounts [${rangeStr}]`,
                    task: async (ctx: Context) => {
                      ctx.resultTracker = await self.accountManager.updateSpecialAccountsKeys(
                        ctx.config.namespace, currentSet,
                        ctx.updateSecrets, ctx.resultTracker)
                    }
                  })
                }

                // set up the sub-tasks
                return task.newListr(subTasks, {
                  concurrent: false,
                  rendererOptions: {
                    collapseSubtasks: false
                  }
                })
              }
            },
            {
              title: 'Display results',
              task: (ctx) => {
                self.logger.showUser(chalk.green(`Account keys updated SUCCESSFULLY: ${ctx.resultTracker.fulfilledCount}`))
                if (ctx.resultTracker.skippedCount > 0) self.logger.showUser(chalk.cyan(`Account keys updates SKIPPED: ${ctx.resultTracker.skippedCount}`))
                if (ctx.resultTracker.rejectedCount > 0) {
                  self.logger.showUser(chalk.yellowBright(`Account keys updates with ERROR: ${ctx.resultTracker.rejectedCount}`))
                }
                self.logger.showUser(chalk.gray('Waiting for sockets to be closed....'))
                if (ctx.resultTracker.rejectedCount > 0) {
                  throw new SoloError(`Account keys updates failed for ${ctx.resultTracker.rejectedCount} accounts.`)
                }
              }
            }
          ], {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false
            }
          })
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error in creating account: ${e.message}`, e)
    } finally {
      await this.closeConnections()
    }

    return true
  }

  async create (argv: any) {
    const self = this

    interface Context {
      config: {
        amount: number
        ecdsaPrivateKey: string
        namespace: string
        privateKey: string
        setAlias: boolean
      };
      privateKey: PrivateKey
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace
          ])

          const config = {
            amount: <number>self.configManager.getFlag<number>(flags.amount),
            ecdsaPrivateKey: <string>self.configManager.getFlag<string>(flags.ecdsaPrivateKey),
            namespace: <string>self.configManager.getFlag<string>(flags.namespace),
            privateKey: <string>self.configManager.getFlag<string>(flags.privateKey),
            setAlias: <boolean>self.configManager.getFlag<boolean>(flags.setAlias)
          }

          if (!config.amount) {
            config.amount = flags.amount.definition.defaultValue as number
          }

          if (!await this.k8.hasNamespace(config.namespace)) {
            throw new SoloError(`namespace ${config.namespace} does not exist`)
          }

          // set config in the context for later tasks to use
          ctx.config = config

          self.logger.debug('Initialized config', { config })

          await self.accountManager.loadNodeClient(ctx.config.namespace)
        }
      },
      {
        title: 'create the new account.ts',
        task: async (ctx) => {
          self.accountInfo = await self.createNewAccount(ctx)
          const accountInfoCopy = { ...self.accountInfo }
          delete accountInfoCopy.privateKey

          this.logger.showJSON('new account created', accountInfoCopy)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error in creating account: ${e.message}`, e)
    } finally {
      await this.closeConnections()
    }

    return true
  }

  async update (argv: any) {
    const self = this

    interface Context {
      config: {
        accountId: string;
        amount: number;
        namespace: string;
        privateKey: string;
      },
      accountInfo: { accountId: string; balance: number; publicKey: string; privateKey?: string }
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.accountId,
            flags.namespace
          ])

          const config = {
            accountId: <string>self.configManager.getFlag<string>(flags.accountId),
            amount: <number>self.configManager.getFlag<number>(flags.amount),
            namespace: <string>self.configManager.getFlag<string>(flags.namespace),
            privateKey: <string>self.configManager.getFlag<string>(flags.privateKey)
          }

          if (!await this.k8.hasNamespace(config.namespace)) {
            throw new SoloError(`namespace ${config.namespace} does not exist`)
          }

          // set config in the context for later tasks to use
          ctx.config = config

          await self.accountManager.loadNodeClient(config.namespace)

          self.logger.debug('Initialized config', { config })
        }
      },
      {
        title: 'get the account info',
        task: async (ctx) => {
          ctx.accountInfo = await self.buildAccountInfo(await self.getAccountInfo(ctx), ctx.config.namespace, !!ctx.config.privateKey)
        }
      },
      {
        title: 'update the account',
        task: async (ctx) => {
          if (!(await self.updateAccountInfo(ctx))) {
            throw new SoloError(`An error occurred updating account ${ctx.accountInfo.accountId}`)
          }
        }
      },
      {
        title: 'get the updated account info',
        task: async (ctx) => {
          self.accountInfo = await self.buildAccountInfo(await self.getAccountInfo(ctx), ctx.config.namespace, false)
          this.logger.showJSON('account info', self.accountInfo)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error in updating account: ${e.message}`, e)
    } finally {
      await this.closeConnections()
    }

    return true
  }

  async get (argv: any) {
    const self = this

    interface Context {
      config: {
        accountId: string;
        namespace: string;
      }
    }

    // @ts-ignore
    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.accountId,
            flags.namespace
          ])

          const config = {
            accountId: <string>self.configManager.getFlag<string>(flags.accountId),
            namespace: <string>self.configManager.getFlag<string>(flags.namespace)
          }

          if (!await this.k8.hasNamespace(config.namespace)) {
            throw new SoloError(`namespace ${config.namespace} does not exist`)
          }

          // set config in the context for later tasks to use
          ctx.config = config

          await self.accountManager.loadNodeClient(config.namespace)

          self.logger.debug('Initialized config', { config })
        }
      },
      {
        title: 'get the account info',
        task: async (ctx) => {
          self.accountInfo = await self.buildAccountInfo(await self.getAccountInfo(ctx), ctx.config.namespace, false)
          this.logger.showJSON('account info', self.accountInfo)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error in getting account info: ${e.message}`, e)
    } finally {
      await this.closeConnections()
    }

    return true
  }

  /** Return Yargs command definition for 'node' command */
  getCommandDefinition (): { command: string; desc: string; builder: Function } {
    const accountCmd = this
    return {
      command: 'account',
      desc: 'Manage Hedera accounts in solo network',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'init',
            desc: 'Initialize system accounts with new keys',
            builder: (y: any) => flags.setCommandFlags(y,
              flags.namespace
            ),
            handler: (argv: any) => {
              accountCmd.logger.debug('==== Running \'account init\' ===')
              accountCmd.logger.debug(argv)

              accountCmd.init(argv).then(r => {
                accountCmd.logger.debug('==== Finished running \'account init\' ===')
                if (!r) process.exit(1)
              }).catch(err => {
                accountCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'create',
            desc: 'Creates a new account with a new key and stores the key in the Kubernetes secrets',
            builder: (y: any) => flags.setCommandFlags(y,
              flags.amount,
              flags.ecdsaPrivateKey,
              flags.namespace,
              flags.privateKey,
              flags.setAlias
            ),
            handler: (argv: any) => {
              accountCmd.logger.debug("==== Running 'account create' ===")
              accountCmd.logger.debug(argv)

              accountCmd.create(argv).then(r => {
                accountCmd.logger.debug("==== Finished running 'account create' ===")
                if (!r) process.exit(1)
              }).catch(err => {
                accountCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'update',
            desc: 'Updates an existing account with the provided info\n',
            builder: (y: any) => flags.setCommandFlags(y,
              flags.accountId,
              flags.amount,
              flags.namespace,
              flags.privateKey
            ),
            handler: (argv: any) => {
              accountCmd.logger.debug("==== Running 'account update' ===")
              accountCmd.logger.debug(argv)

              accountCmd.update(argv).then(r => {
                accountCmd.logger.debug("==== Finished running 'account update' ===")
                if (!r) process.exit(1)
              }).catch(err => {
                accountCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'get',
            desc: 'Gets the account info including the current amount of HBAR',
            builder: (y: any) => flags.setCommandFlags(y,
              flags.accountId,
              flags.namespace
            ),
            handler: (argv: any) => {
              accountCmd.logger.debug("==== Running 'account get' ===")
              accountCmd.logger.debug(argv)

              accountCmd.get(argv).then(r => {
                accountCmd.logger.debug("==== Finished running 'account get' ===")
                if (!r) process.exit(1)
              }).catch(err => {
                accountCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .demandCommand(1, 'Select an account command')
      }
    }
  }
}
