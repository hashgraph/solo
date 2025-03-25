// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {BaseCommand} from './base.js';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {Flags as flags} from './flags.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {FREEZE_ADMIN_ACCOUNT} from '../core/constants.js';
import * as helpers from '../core/helpers.js';
import {type AccountManager} from '../core/account-manager.js';
import {type AccountId, AccountInfo, HbarUnit, Long, NodeUpdateTransaction, PrivateKey} from '@hashgraph/sdk';
import {ListrLock} from '../core/lock/listr-lock.js';
import {type ArgvStruct, type AnyYargs, type NodeAliases} from '../types/aliases.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterRef, type DeploymentName} from '../core/config/remote/types.js';
import {type SoloListrTask} from '../types/index.js';
import {Templates} from '../core/templates.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {Base64} from 'js-base64';
import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';

interface UpdateAccountConfig {
  accountId: string;
  amount: number;
  namespace: NamespaceName;
  deployment: DeploymentName;
  ecdsaPrivateKey: string;
  ed25519PrivateKey: string;
  clusterRef: ClusterRef;
  contextName: string;
}

interface UpdateAccountContext {
  config: UpdateAccountConfig;
  accountInfo: {accountId: AccountId | string; balance: number; publicKey: string; privateKey?: string};
}

export class AccountCommand extends BaseCommand {
  private accountInfo: {
    accountId: string;
    balance: number;
    publicKey: string;
    privateKey?: string;
    accountAlias?: string;
  } | null;

  public constructor(
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.SystemAccounts) private readonly systemAccounts: number[][],
  ) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.accountInfo = null;
    this.systemAccounts = systemAccounts;
  }

  public static readonly COMMAND_NAME = 'account';

  private static INIT_FLAGS_LIST = [flags.deployment, flags.nodeAliasesUnparsed, flags.clusterRef];

  private static CREATE_FLAGS_LIST = [
    flags.amount,
    flags.createAmount,
    flags.ecdsaPrivateKey,
    flags.deployment,
    flags.ed25519PrivateKey,
    flags.generateEcdsaKey,
    flags.setAlias,
    flags.clusterRef,
  ];

  private static UPDATE_FLAGS_LIST = [
    flags.accountId,
    flags.amount,
    flags.deployment,
    flags.ecdsaPrivateKey,
    flags.ed25519PrivateKey,
    flags.clusterRef,
  ];

  private static GET_FLAGS_LIST = [flags.accountId, flags.privateKey, flags.deployment, flags.clusterRef];

  private async closeConnections(): Promise<void> {
    await this.accountManager.close();
  }

  private async buildAccountInfo(
    accountInfo: AccountInfo,
    namespace: NamespaceName,
    shouldRetrievePrivateKey: boolean,
  ): Promise<{accountId: string; balance: number; publicKey: string; privateKey?: string; privateKeyRaw?: string}> {
    if (!accountInfo || !(accountInfo instanceof AccountInfo)) {
      throw new IllegalArgumentError('An instance of AccountInfo is required');
    }

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
        throw new SoloError(`failed to retrieve EVM address for accountId ${newAccountInfo.accountId}`);
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
      contextName: string;
    };
    privateKey: PrivateKey;
  }): Promise<{accountId: string; privateKey: string; publicKey: string; balance: number; accountAlias?: string}> {
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
      ctx.config.contextName,
    );
  }

  private getAccountInfo(ctx: {config: {accountId: string}}): Promise<AccountInfo> {
    return this.accountManager.accountInfoQuery(ctx.config.accountId);
  }

  private async updateAccountInfo(ctx: UpdateAccountContext): Promise<boolean> {
    let amount = ctx.config.amount;
    if (ctx.config.ed25519PrivateKey) {
      if (
        !(await this.accountManager.sendAccountKeyUpdate(
          ctx.accountInfo.accountId,
          ctx.config.ed25519PrivateKey,
          ctx.accountInfo.privateKey,
        ))
      ) {
        throw new SoloError(`failed to update account keys for accountId ${ctx.accountInfo.accountId}`);
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
        throw new SoloError(`failed to transfer amount for accountId ${ctx.accountInfo.accountId}`);
      }
      this.logger.debug(`sent transfer amount for account ${ctx.accountInfo.accountId}`);
    }
    return true;
  }

  private async transferAmountFromOperator(toAccountId: AccountId | string, amount: number): Promise<boolean> {
    return await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, toAccountId, amount);
  }

  public async init(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      namespace: NamespaceName;
      nodeAliases: NodeAliases;
      clusterRef: ClusterRef;
      deployment: DeploymentName;
      contextName: string;
    }

    interface Context {
      config: Config;
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

            flags.disablePrompts([flags.clusterRef]);

            const config = {
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              clusterRef: self.configManager.getFlag(flags.clusterRef) as ClusterRef,
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
            } as Config;

            config.contextName =
              this.localConfig.clusterRefs[config.clusterRef] ?? self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace.name} does not exist`);
            }

            // set config in the context for later tasks to use
            ctx.config = config;

            self.logger.debug('Initialized config', {config});

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              self.configManager.getFlag<DeploymentName>(flags.deployment),
              self.configManager.getFlag<boolean>(flags.forcePortForward),
              config.contextName,
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
                      .getK8(ctx.config.clusterRef)
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
                        task: async ctx => {
                          ctx.resultTracker = await self.accountManager.updateSpecialAccountsKeys(
                            ctx.config.namespace,
                            currentSet,
                            ctx.updateSecrets,
                            ctx.resultTracker,
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
                        self.remoteConfigManager.getClusterRefs(),
                        nodeAlias,
                        ctx.config.deployment,
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
                          .getK8(ctx.config.contextName)
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
      await self.create({} as ArgvStruct);
      await self.create({} as ArgvStruct);
    }

    return true;
  }

  public async create(argv: ArgvStruct): Promise<boolean> {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Config {
      amount: number;
      ecdsaPrivateKey: string;
      ed25519PrivateKey: string;
      namespace: NamespaceName;
      deployment: DeploymentName;
      setAlias: boolean;
      generateEcdsaKey: boolean;
      createAmount: number;
      contextName: string;
      clusterRef: ClusterRef;
    }

    interface Context {
      config: Config;
      privateKey: PrivateKey;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const config = {
              amount: self.configManager.getFlag<number>(flags.amount) as number,
              ecdsaPrivateKey: self.configManager.getFlag<string>(flags.ecdsaPrivateKey) as string,
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              ed25519PrivateKey: self.configManager.getFlag<string>(flags.ed25519PrivateKey) as string,
              setAlias: self.configManager.getFlag<boolean>(flags.setAlias) as boolean,
              generateEcdsaKey: self.configManager.getFlag<boolean>(flags.generateEcdsaKey) as boolean,
              createAmount: self.configManager.getFlag<number>(flags.createAmount) as number,
              clusterRef: self.configManager.getFlag(flags.clusterRef) as ClusterRef,
            } as Config;

            config.contextName =
              this.localConfig.clusterRefs[config.clusterRef] ?? self.k8Factory.default().contexts().readCurrent();

            if (!config.amount) {
              config.amount = flags.amount.definition.defaultValue as number;
            }

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            ctx.config = config;

            self.logger.debug('Initialized config', {config});

            await self.accountManager.loadNodeClient(
              ctx.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
              config.contextName,
            );

            return ListrLock.newAcquireLockTask(lease, task);
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

  public async update(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    const tasks = new Listr<UpdateAccountContext>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            await self.configManager.executePrompt(task, [flags.accountId]);

            const config = {
              accountId: self.configManager.getFlag(flags.accountId),
              amount: self.configManager.getFlag<number>(flags.amount),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              ecdsaPrivateKey: self.configManager.getFlag(flags.ecdsaPrivateKey),
              ed25519PrivateKey: self.configManager.getFlag(flags.ed25519PrivateKey),
              clusterRef: self.configManager.getFlag<ClusterRef>(flags.clusterRef),
            } as UpdateAccountConfig;

            config.contextName =
              this.localConfig.clusterRefs[config.clusterRef] ?? self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            ctx.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
              config.contextName,
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

  public async get(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      accountId: string;
      namespace: NamespaceName;
      privateKey: boolean;
      deployment: DeploymentName;
      clusterRef: ClusterRef;
      contextName: string;
    }

    interface Context {
      config: Config;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.accountId]);

            flags.disablePrompts([flags.clusterRef]);

            const config = {
              accountId: self.configManager.getFlag(flags.accountId),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              privateKey: self.configManager.getFlag<boolean>(flags.privateKey),
              clusterRef: self.configManager.getFlag<ClusterRef>(flags.clusterRef),
            } as Config;

            config.contextName =
              this.localConfig.clusterRefs[config.clusterRef] ?? self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            ctx.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
              config.contextName,
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

  public getCommandDefinition() {
    const self = this;
    return {
      command: AccountCommand.COMMAND_NAME,
      desc: 'Manage Hedera accounts in solo network',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'init',
            desc: 'Initialize system accounts with new keys',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...AccountCommand.INIT_FLAGS_LIST),
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'account init' ===");
              self.logger.info(argv);

              await self
                .init(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account init' ===");
                  if (!r) throw new SoloError('Error running init, expected return value to be true');
                })
                .catch(err => {
                  throw new SoloError(`Error running init: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'create',
            desc: 'Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no key one will be generated for you, otherwise you may supply either a ECDSA or ED25519 private key',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...AccountCommand.CREATE_FLAGS_LIST),
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'account create' ===");
              self.logger.info(argv);

              await self
                .create(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account create' ===");
                  if (!r) throw new SoloError('Error running create, expected return value to be true');
                })
                .catch(err => {
                  throw new SoloError(`Error running create: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'update',
            desc: 'Updates an existing account with the provided info, if you want to update the private key, you can supply either ECDSA or ED25519 but not both\n',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...AccountCommand.UPDATE_FLAGS_LIST),
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'account update' ===");
              self.logger.info(argv);

              await self
                .update(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account update' ===");
                  if (!r) throw new SoloError('Error running update, expected return value to be true');
                })
                .catch(err => {
                  throw new SoloError(`Error running update: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'get',
            desc: 'Gets the account info including the current amount of HBAR',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...AccountCommand.GET_FLAGS_LIST),
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'account get' ===");
              self.logger.info(argv);

              await self
                .get(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account get' ===");
                  if (!r) throw new SoloError('Error running get, expected return value to be true');
                })
                .catch(err => {
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
