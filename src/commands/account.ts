/**
 * SPDX-License-Identifier: Apache-2.0
 */
import chalk from 'chalk';
import {BaseCommand, type Opts} from './base.js';
import {IllegalArgumentError, SoloError} from '../core/errors.js';
import {Flags as flags} from './flags.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {FREEZE_ADMIN_ACCOUNT} from '../core/constants.js';
import * as helpers from '../core/helpers.js';
import {sleep} from '../core/helpers.js';
import {type AccountManager} from '../core/account_manager.js';
import {type AccountId, AccountInfo, HbarUnit, Long, NodeUpdateTransaction, PrivateKey} from '@hashgraph/sdk';
import {ListrLease} from '../core/lease/listr_lease.js';
import {type AnyArgv, type AnyYargs, type NodeAliases} from '../types/aliases.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {Duration} from '../core/time/duration.js';
import {type NamespaceName} from '../core/kube/resources/namespace/namespace_name.js';
import {type DeploymentName} from '../core/config/remote/types.js';
import {type SoloListrTask} from '../types/index.js';
import {Templates} from '../core/templates.js';
import {SecretType} from '../core/kube/resources/secret/secret_type.js';
import {Base64} from 'js-base64';

interface UpdateAccountContext {
  config: {
    accountId: string;
    amount: number;
    namespace: NamespaceName;
    ecdsaPrivateKey: string;
    ed25519PrivateKey: string;
  };
  accountInfo: {accountId: AccountId | string; balance: number; publicKey: string; privateKey?: string};
}

export class AccountCommand extends BaseCommand {
  private readonly accountManager: AccountManager;
  private accountInfo: {
    accountId: string;
    balance: number;
    publicKey: string;
    privateKey?: string;
    accountAlias?: string;
  } | null;
  private readonly systemAccounts: number[][];

  public constructor(opts: Opts, systemAccounts: number[][] = constants.SYSTEM_ACCOUNTS) {
    super(opts);

    if (!opts || !opts.accountManager)
      throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager);

    this.accountManager = opts.accountManager;
    this.accountInfo = null;
    this.systemAccounts = systemAccounts;
  }

  private async closeConnections(): Promise<void> {
    await this.accountManager.close();
  }

  private async buildAccountInfo(
    accountInfo: AccountInfo,
    namespace: NamespaceName,
    shouldRetrievePrivateKey: boolean,
  ) {
    if (!accountInfo || !(accountInfo instanceof AccountInfo))
      throw new IllegalArgumentError('An instance of AccountInfo is required');

    const newAccountInfo: {
      accountId: string;
      balance: number;
      publicKey: string;
      privateKey?: string;
      privateKeyRaw?: string;
    } = {
      accountId: accountInfo.accountId.toString(),
      publicKey: accountInfo.key.toString(),
      balance: accountInfo.balance.to(HbarUnit.Hbar).toNumber(),
    };

    if (shouldRetrievePrivateKey) {
      const accountKeys = await this.accountManager.getAccountKeysFromSecret(newAccountInfo.accountId, namespace);
      newAccountInfo.privateKey = accountKeys.privateKey;

      // reconstruct private key to retrieve EVM address if private key is ECDSA type
      try {
        const privateKey = PrivateKey.fromStringDer(newAccountInfo.privateKey);
        newAccountInfo.privateKeyRaw = privateKey.toStringRaw();
      } catch {
        this.logger.error(`failed to retrieve EVM address for accountId ${newAccountInfo.accountId}`);
      }
    }

    return newAccountInfo;
  }

  public async createNewAccount(ctx: {
    config: {
      generateEcdsaKey: boolean;
      ecdsaPrivateKey?: string;
      ed25519PrivateKey?: string;
      namespace: NamespaceName;
      setAlias: boolean;
      amount: number;
    };
    privateKey: PrivateKey;
  }) {
    if (ctx.config.ecdsaPrivateKey) {
      ctx.privateKey = PrivateKey.fromStringECDSA(ctx.config.ecdsaPrivateKey);
    } else if (ctx.config.ed25519PrivateKey) {
      ctx.privateKey = PrivateKey.fromStringED25519(ctx.config.ed25519PrivateKey);
    } else if (ctx.config.generateEcdsaKey) {
      ctx.privateKey = PrivateKey.generateECDSA();
    } else {
      ctx.privateKey = PrivateKey.generateED25519();
    }

    return await this.accountManager.createNewAccount(
      ctx.config.namespace,
      ctx.privateKey,
      ctx.config.amount,
      ctx.config.ecdsaPrivateKey || ctx.config.generateEcdsaKey ? ctx.config.setAlias : false,
    );
  }

  private getAccountInfo(ctx: {config: {accountId: string}}): Promise<AccountInfo> {
    return this.accountManager.accountInfoQuery(ctx.config.accountId);
  }

  private async updateAccountInfo(ctx: UpdateAccountContext) {
    let amount = ctx.config.amount;
    if (ctx.config.ed25519PrivateKey) {
      if (
        !(await this.accountManager.sendAccountKeyUpdate(
          ctx.accountInfo.accountId,
          ctx.config.ed25519PrivateKey,
          ctx.accountInfo.privateKey,
        ))
      ) {
        this.logger.error(`failed to update account keys for accountId ${ctx.accountInfo.accountId}`);
        return false;
      }
    } else {
      amount = amount || (flags.amount.definition.defaultValue as number);
    }

    const hbarAmount = Number.parseFloat(amount.toString());
    if (amount && isNaN(hbarAmount)) {
      throw new SoloError(`The HBAR amount was invalid: ${amount}`);
    }

    if (hbarAmount > 0) {
      if (!(await this.transferAmountFromOperator(ctx.accountInfo.accountId, hbarAmount))) {
        this.logger.error(`failed to transfer amount for accountId ${ctx.accountInfo.accountId}`);
        return false;
      }
      this.logger.debug(`sent transfer amount for account ${ctx.accountInfo.accountId}`);
    }
    return true;
  }

  private async transferAmountFromOperator(toAccountId: AccountId | string, amount: number): Promise<boolean> {
    return await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, toAccountId, amount);
  }

  public async init(argv: AnyArgv) {
    const self = this;

    interface Context {
      config: {
        namespace: NamespaceName;
        nodeAliases: NodeAliases;
        contexts: string[];
      };
      updateSecrets: boolean;
      accountsBatchedSet: number[][];
      resultTracker: {
        rejectedCount: number;
        fulfilledCount: number;
        skippedCount: number;
      };
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);
            const config = {
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              contexts: this.remoteConfigManager.getContexts(),
              nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
            };

            if (!(await this.k8Factory.getK8(config.contexts[0]).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace.name} does not exist`);
            }

            // set config in the context for later tasks to use
            ctx.config = config;

            self.logger.debug('Initialized config', {config});

            await self.accountManager.loadNodeClient(
              ctx.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
        },
        {
          title: 'Update special account keys',
          task: (_, task) => {
            return new Listr(
              [
                {
                  title: 'Prepare for account key updates',
                  task: async ctx => {
                    ctx.updateSecrets = await self.k8Factory
                      .default()
                      .secrets()
                      .list(ctx.config.namespace, ['solo.hedera.com/account-id'])
                      .then(secrets => secrets.length > 0);

                    ctx.accountsBatchedSet = self.accountManager.batchAccounts(this.systemAccounts);

                    ctx.resultTracker = {
                      rejectedCount: 0,
                      fulfilledCount: 0,
                      skippedCount: 0,
                    };

                    // do a write transaction to trigger the handler and generate the system accounts to complete genesis
                    await self.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, FREEZE_ADMIN_ACCOUNT, 1);
                  },
                },
                {
                  title: 'Update special account key sets',
                  task: ctx => {
                    const subTasks: SoloListrTask<Context>[] = [];
                    const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm;
                    const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard;

                    for (const currentSet of ctx.accountsBatchedSet) {
                      const accStart = `${realm}.${shard}.${currentSet[0]}`;
                      const accEnd = `${realm}.${shard}.${currentSet[currentSet.length - 1]}`;
                      const rangeStr =
                        accStart !== accEnd
                          ? `${chalk.yellow(accStart)} to ${chalk.yellow(accEnd)}`
                          : `${chalk.yellow(accStart)}`;

                      subTasks.push({
                        title: `Updating accounts [${rangeStr}]`,
                        task: async (ctx: Context) => {
                          ctx.resultTracker = await self.accountManager.updateSpecialAccountsKeys(
                            ctx.config.namespace,
                            currentSet,
                            ctx.updateSecrets,
                            ctx.resultTracker,
                            ctx.config.contexts,
                          );
                        },
                      });
                    }

                    // set up the sub-tasks
                    return task.newListr(subTasks, {
                      concurrent: false,
                      rendererOptions: {
                        collapseSubtasks: false,
                      },
                    });
                  },
                },
                {
                  title: 'Update node admin key',
                  task: async ctx => {
                    const adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
                    for (const nodeAlias of ctx.config.nodeAliases) {
                      const nodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
                      const nodeClient = await self.accountManager.refreshNodeClient(
                        ctx.config.namespace,
                        nodeAlias,
                        self.remoteConfigManager.getClusterRefs(),
                        this.configManager.getFlag<DeploymentName>(flags.deployment),
                      );

                      try {
                        let nodeUpdateTx = new NodeUpdateTransaction().setNodeId(new Long(nodeId));
                        const newPrivateKey = PrivateKey.generateED25519();

                        nodeUpdateTx = nodeUpdateTx.setAdminKey(newPrivateKey.publicKey);
                        nodeUpdateTx = nodeUpdateTx.freezeWith(nodeClient);
                        nodeUpdateTx = await nodeUpdateTx.sign(newPrivateKey);
                        const signedTx = await nodeUpdateTx.sign(adminKey);
                        const txResp = await signedTx.execute(nodeClient);
                        const nodeUpdateReceipt = await txResp.getReceipt(nodeClient);

                        self.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()} for node ${nodeAlias}`);

                        // save new key in k8s secret
                        const data = {
                          privateKey: Base64.encode(newPrivateKey.toString()),
                          publicKey: Base64.encode(newPrivateKey.publicKey.toString()),
                        };
                        await this.k8Factory
                          .default()
                          .secrets()
                          .create(
                            ctx.config.namespace,
                            Templates.renderNodeAdminKeyName(nodeAlias),
                            SecretType.OPAQUE,
                            data,
                            {
                              'solo.hedera.com/node-admin-key': 'true',
                            },
                          );
                      } catch (e) {
                        throw new SoloError(`Error updating admin key for node ${nodeAlias}: ${e.message}`, e);
                      }
                    }
                  },
                },
                {
                  title: 'Display results',
                  task: ctx => {
                    self.logger.showUser(
                      chalk.green(`Account keys updated SUCCESSFULLY: ${ctx.resultTracker.fulfilledCount}`),
                    );
                    if (ctx.resultTracker.skippedCount > 0)
                      self.logger.showUser(
                        chalk.cyan(`Account keys updates SKIPPED: ${ctx.resultTracker.skippedCount}`),
                      );
                    if (ctx.resultTracker.rejectedCount > 0) {
                      self.logger.showUser(
                        chalk.yellowBright(`Account keys updates with ERROR: ${ctx.resultTracker.rejectedCount}`),
                      );
                    }
                    self.logger.showUser(chalk.gray('Waiting for sockets to be closed....'));

                    if (ctx.resultTracker.rejectedCount > 0) {
                      throw new SoloError(
                        `Account keys updates failed for ${ctx.resultTracker.rejectedCount} accounts.`,
                      );
                    }
                  },
                },
              ],
              {
                concurrent: false,
                rendererOptions: {
                  collapseSubtasks: false,
                },
              },
            );
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e) {
      throw new SoloError(`Error in creating account: ${e.message}`, e);
    } finally {
      await this.closeConnections();
      // create two accounts to force the handler to trigger
      await self.create({});
      await self.create({});
    }

    return true;
  }

  public async create(argv: AnyArgv) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: {
        amount: number;
        ecdsaPrivateKey: string;
        ed25519PrivateKey: string;
        namespace: NamespaceName;
        setAlias: boolean;
        generateEcdsaKey: boolean;
        createAmount: number;
      };
      privateKey: PrivateKey;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            const config = {
              amount: self.configManager.getFlag<number>(flags.amount) as number,
              ecdsaPrivateKey: self.configManager.getFlag<string>(flags.ecdsaPrivateKey) as string,
              namespace: namespace,
              ed25519PrivateKey: self.configManager.getFlag<string>(flags.ed25519PrivateKey) as string,
              setAlias: self.configManager.getFlag<boolean>(flags.setAlias) as boolean,
              generateEcdsaKey: self.configManager.getFlag<boolean>(flags.generateEcdsaKey) as boolean,
              createAmount: self.configManager.getFlag<number>(flags.createAmount) as number,
            };

            if (!config.amount) {
              config.amount = flags.amount.definition.defaultValue as number;
            }

            if (!(await this.k8Factory.default().namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            ctx.config = config;

            self.logger.debug('Initialized config', {config});

            await self.accountManager.loadNodeClient(
              ctx.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        {
          title: 'create the new account',
          task: async (ctx, task) => {
            const subTasks: SoloListrTask<Context>[] = [];

            for (let i = 0; i < ctx.config.createAmount; i++) {
              subTasks.push({
                title: `Create accounts [${i}]`,
                task: async (ctx: Context) => {
                  self.accountInfo = await self.createNewAccount(ctx);
                  const accountInfoCopy = {...self.accountInfo};
                  delete accountInfoCopy.privateKey;
                  this.logger.showJSON('new account created', accountInfoCopy);
                },
              });
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: 8,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e) {
      throw new SoloError(`Error in creating account: ${e.message}`, e);
    } finally {
      await lease.release();
      await this.closeConnections();
    }

    return true;
  }

  public async update(argv: AnyArgv) {
    const self = this;

    const tasks = new Listr<UpdateAccountContext>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.accountId]);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            const config = {
              accountId: self.configManager.getFlag<string>(flags.accountId) as string,
              amount: self.configManager.getFlag<number>(flags.amount) as number,
              namespace: namespace,
              ecdsaPrivateKey: self.configManager.getFlag<string>(flags.ecdsaPrivateKey) as string,
              ed25519PrivateKey: self.configManager.getFlag<string>(flags.ed25519PrivateKey) as string,
            };

            if (!(await this.k8Factory.default().namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            ctx.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            self.logger.debug('Initialized config', {config});
          },
        },
        {
          title: 'get the account info',
          task: async ctx => {
            ctx.accountInfo = await self.buildAccountInfo(
              await self.getAccountInfo(ctx),
              ctx.config.namespace,
              !!ctx.config.ed25519PrivateKey,
            );
          },
        },
        {
          title: 'update the account',
          task: async ctx => {
            if (!(await self.updateAccountInfo(ctx))) {
              throw new SoloError(`An error occurred updating account ${ctx.accountInfo.accountId}`);
            }
          },
        },
        {
          title: 'get the updated account info',
          task: async ctx => {
            self.accountInfo = await self.buildAccountInfo(await self.getAccountInfo(ctx), ctx.config.namespace, false);
            this.logger.showJSON('account info', self.accountInfo);
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e) {
      throw new SoloError(`Error in updating account: ${e.message}`, e);
    } finally {
      await this.closeConnections();
    }

    return true;
  }

  public async get(argv: AnyArgv) {
    const self = this;

    interface Context {
      config: {
        accountId: string;
        namespace: NamespaceName;
        privateKey: boolean;
      };
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.accountId]);
            const namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);

            const config = {
              accountId: self.configManager.getFlag<string>(flags.accountId) as string,
              namespace: namespace,
              privateKey: self.configManager.getFlag<boolean>(flags.privateKey) as boolean,
            };

            if (!(await this.k8Factory.default().namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            ctx.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            self.logger.debug('Initialized config', {config});
          },
        },
        {
          title: 'get the account info',
          task: async ctx => {
            self.accountInfo = await self.buildAccountInfo(
              await self.getAccountInfo(ctx),
              ctx.config.namespace,
              ctx.config.privateKey,
            );
            this.logger.showJSON('account info', self.accountInfo);
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e) {
      throw new SoloError(`Error in getting account info: ${e.message}`, e);
    } finally {
      await this.closeConnections();
    }

    return true;
  }

  /** Return Yargs command definition for 'node' command */
  public getCommandDefinition() {
    const self = this;
    return {
      command: 'account',
      desc: 'Manage Hedera accounts in solo network',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'init',
            desc: 'Initialize system accounts with new keys',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, flags.deployment, flags.nodeAliasesUnparsed),
            handler: async (argv: AnyArgv) => {
              self.logger.info("==== Running 'account init' ===");
              self.logger.info(argv);

              await self
                .init(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account init' ===");
                  if (!r) throw new SoloError('Error running init, expected return value to be true');
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  throw new SoloError(`Error running init: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'create',
            desc: 'Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no key one will be generated for you, otherwise you may supply either a ECDSA or ED25519 private key',
            builder: (y: AnyYargs) =>
              flags.setCommandFlags(
                y,
                flags.amount,
                flags.createAmount,
                flags.ecdsaPrivateKey,
                flags.deployment,
                flags.ed25519PrivateKey,
                flags.generateEcdsaKey,
                flags.setAlias,
              ),
            handler: async (argv: AnyArgv) => {
              self.logger.info("==== Running 'account create' ===");
              self.logger.info(argv);

              await self
                .create(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account create' ===");
                  if (!r) throw new SoloError('Error running create, expected return value to be true');
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  throw new SoloError(`Error running create: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'update',
            desc: 'Updates an existing account with the provided info, if you want to update the private key, you can supply either ECDSA or ED25519 but not both\n',
            builder: (y: AnyYargs) =>
              flags.setCommandFlags(
                y,
                flags.accountId,
                flags.amount,
                flags.deployment,
                flags.ecdsaPrivateKey,
                flags.ed25519PrivateKey,
              ),
            handler: async (argv: AnyArgv) => {
              self.logger.info("==== Running 'account update' ===");
              self.logger.info(argv);

              await self
                .update(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account update' ===");
                  if (!r) throw new SoloError('Error running update, expected return value to be true');
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  throw new SoloError(`Error running update: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'get',
            desc: 'Gets the account info including the current amount of HBAR',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, flags.accountId, flags.privateKey, flags.deployment),
            handler: async (argv: AnyArgv) => {
              self.logger.info("==== Running 'account get' ===");
              self.logger.info(argv);

              await self
                .get(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account get' ===");
                  if (!r) throw new SoloError('Error running get, expected return value to be true');
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  throw new SoloError(`Error running get: ${err.message}`, err);
                });
            },
          })
          .demandCommand(1, 'Select an account command');
      },
    };
  }

  public close(): Promise<void> {
    return this.closeConnections();
  }
}
