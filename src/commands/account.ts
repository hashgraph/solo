// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {BaseCommand, type Options} from './base.js';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {Flags as flags} from './flags.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import * as helpers from '../core/helpers.js';
import {type AccountManager} from '../core/account-manager.js';
import {type AccountId, AccountInfo, HbarUnit, Long, NodeUpdateTransaction, PrivateKey} from '@hashgraph/sdk';
import {ListrLock} from '../core/lock/listr-lock.js';
import {type ArgvStruct, type AnyYargs, type NodeAliases} from '../types/aliases.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterReference, type DeploymentName, type Realm, type Shard} from '../core/config/remote/types.js';
import {type SoloListrTask} from '../types/index.js';
import {Templates} from '../core/templates.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {Base64} from 'js-base64';
import {entityId} from '../core/helpers.js';

interface UpdateAccountConfig {
  accountId: string;
  amount: number;
  namespace: NamespaceName;
  deployment: DeploymentName;
  ecdsaPrivateKey: string;
  ed25519PrivateKey: string;
  clusterRef: ClusterReference;
  contextName: string;
}

interface UpdateAccountContext {
  config: UpdateAccountConfig;
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

  public constructor(options: Options, systemAccounts: number[][] = constants.SYSTEM_ACCOUNTS) {
    super(options);

    if (!options || !options.accountManager) {
      throw new IllegalArgumentError('An instance of core/AccountManager is required', options.accountManager);
    }

    this.accountManager = options.accountManager;
    this.accountInfo = null;
    this.systemAccounts = systemAccounts;
  }

  public static readonly COMMAND_NAME = 'account';

  private static INIT_FLAGS_LIST = {
    required: [],
    optional: [flags.deployment, flags.nodeAliasesUnparsed, flags.clusterRef],
  };

  private static CREATE_FLAGS_LIST = {
    required: [],
    optional: [
      flags.amount,
      flags.createAmount,
      flags.ecdsaPrivateKey,
      flags.deployment,
      flags.ed25519PrivateKey,
      flags.generateEcdsaKey,
      flags.setAlias,
      flags.clusterRef,
    ],
  };

  private static UPDATE_FLAGS_LIST = {
    required: [],
    optional: [
      flags.accountId,
      flags.amount,
      flags.deployment,
      flags.ecdsaPrivateKey,
      flags.ed25519PrivateKey,
      flags.clusterRef,
    ],
  };

  private static GET_FLAGS_LIST = {
    required: [],
    optional: [flags.accountId, flags.privateKey, flags.deployment, flags.clusterRef],
  };

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

  public async createNewAccount(context_: {
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
    if (context_.config.ecdsaPrivateKey) {
      context_.privateKey = PrivateKey.fromStringECDSA(context_.config.ecdsaPrivateKey);
    } else if (context_.config.ed25519PrivateKey) {
      context_.privateKey = PrivateKey.fromStringED25519(context_.config.ed25519PrivateKey);
    } else if (context_.config.generateEcdsaKey) {
      context_.privateKey = PrivateKey.generateECDSA();
    } else {
      context_.privateKey = PrivateKey.generateED25519();
    }

    return await this.accountManager.createNewAccount(
      context_.config.namespace,
      context_.privateKey,
      context_.config.amount,
      context_.config.ecdsaPrivateKey || context_.config.generateEcdsaKey ? context_.config.setAlias : false,
      context_.config.contextName,
    );
  }

  private getAccountInfo(context_: {config: {accountId: string}}): Promise<AccountInfo> {
    return this.accountManager.accountInfoQuery(context_.config.accountId);
  }

  private async updateAccountInfo(context_: UpdateAccountContext): Promise<boolean> {
    let amount = context_.config.amount;
    if (context_.config.ed25519PrivateKey) {
      if (
        !(await this.accountManager.sendAccountKeyUpdate(
          context_.accountInfo.accountId,
          context_.config.ed25519PrivateKey,
          context_.accountInfo.privateKey,
        ))
      ) {
        throw new SoloError(`failed to update account keys for accountId ${context_.accountInfo.accountId}`);
      }
    } else {
      amount = amount || (flags.amount.definition.defaultValue as number);
    }

    const hbarAmount = Number.parseFloat(amount.toString());
    if (amount && Number.isNaN(hbarAmount)) {
      throw new SoloError(`The HBAR amount was invalid: ${amount}`);
    }

    if (hbarAmount > 0) {
      const deployment: DeploymentName = context_.config.deployment;
      if (!(await this.transferAmountFromOperator(context_.accountInfo.accountId, hbarAmount, deployment))) {
        throw new SoloError(`failed to transfer amount for accountId ${context_.accountInfo.accountId}`);
      }
      this.logger.debug(`sent transfer amount for account ${context_.accountInfo.accountId}`);
    }
    return true;
  }

  private async transferAmountFromOperator(
    toAccountId: AccountId | string,
    amount: number,
    deploymentName: DeploymentName,
  ): Promise<boolean> {
    const operatorAccountId = this.accountManager.getOperatorAccountId(deploymentName);
    return await this.accountManager.transferAmount(operatorAccountId, toAccountId, amount);
  }

  public async init(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      namespace: NamespaceName;
      nodeAliases: NodeAliases;
      clusterRef: ClusterReference;
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
          task: async (context_, task) => {
            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const config = {
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              clusterRef: self.configManager.getFlag(flags.clusterRef) as ClusterReference,
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              nodeAliases: helpers.parseNodeAliases(
                this.configManager.getFlag(flags.nodeAliasesUnparsed),
                this.remoteConfigManager.getConsensusNodes(),
                this.configManager,
              ),
            } as Config;

            config.contextName =
              this.localConfig.clusterRefs[config.clusterRef] ?? self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace.name} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            self.logger.debug('Initialized config', {config});

            await self.accountManager.loadNodeClient(
              config.namespace,
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
                  task: async context_ => {
                    context_.updateSecrets = await self.k8Factory
                      .getK8(context_.config.clusterRef)
                      .secrets()
                      .list(context_.config.namespace, ['solo.hedera.com/account-id'])
                      .then(secrets => secrets.length > 0);

                    context_.accountsBatchedSet = self.accountManager.batchAccounts(this.systemAccounts);

                    context_.resultTracker = {
                      rejectedCount: 0,
                      fulfilledCount: 0,
                      skippedCount: 0,
                    };

                    // do a write transaction to trigger the handler and generate the system accounts to complete genesis
                    const deployment: DeploymentName = context_.config.deployment;
                    const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deployment);
                    const freezeAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
                    await self.accountManager.transferAmount(treasuryAccountId, freezeAccountId, 1);
                  },
                },
                {
                  title: 'Update special account key sets',
                  task: context_ => {
                    const subTasks: SoloListrTask<Context>[] = [];
                    const realm: Realm = this.localConfig.getRealm(context_.config.deployment);
                    const shard: Shard = this.localConfig.getShard(context_.config.deployment);

                    for (const currentSet of context_.accountsBatchedSet) {
                      const accountStart = entityId(shard, realm, currentSet[0]);
                      const accountEnd = entityId(shard, realm, currentSet.at(-1));
                      const rangeString =
                        accountStart === accountEnd
                          ? `${chalk.yellow(accountStart)}`
                          : `${chalk.yellow(accountStart)} to ${chalk.yellow(accountEnd)}`;

                      subTasks.push({
                        title: `Updating accounts [${rangeString}]`,
                        task: async context_ => {
                          context_.resultTracker = await self.accountManager.updateSpecialAccountsKeys(
                            context_.config.namespace,
                            currentSet,
                            context_.updateSecrets,
                            context_.resultTracker,
                            context_.config.deployment,
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
                  task: async context_ => {
                    const adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
                    for (const nodeAlias of context_.config.nodeAliases) {
                      const nodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
                      const nodeClient = await self.accountManager.refreshNodeClient(
                        context_.config.namespace,
                        self.remoteConfigManager.getClusterRefs(),
                        nodeAlias,
                        context_.config.deployment,
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
                          .getK8(context_.config.contextName)
                          .secrets()
                          .create(
                            context_.config.namespace,
                            Templates.renderNodeAdminKeyName(nodeAlias),
                            SecretType.OPAQUE,
                            data,
                            {
                              'solo.hedera.com/node-admin-key': 'true',
                            },
                          );
                      } catch (error) {
                        throw new SoloError(`Error updating admin key for node ${nodeAlias}: ${error.message}`, error);
                      }
                    }
                  },
                },
                {
                  title: 'Display results',
                  task: context_ => {
                    self.logger.showUser(
                      chalk.green(`Account keys updated SUCCESSFULLY: ${context_.resultTracker.fulfilledCount}`),
                    );
                    if (context_.resultTracker.skippedCount > 0) {
                      self.logger.showUser(
                        chalk.cyan(`Account keys updates SKIPPED: ${context_.resultTracker.skippedCount}`),
                      );
                    }
                    if (context_.resultTracker.rejectedCount > 0) {
                      self.logger.showUser(
                        chalk.yellowBright(`Account keys updates with ERROR: ${context_.resultTracker.rejectedCount}`),
                      );
                    }
                    self.logger.showUser(chalk.gray('Waiting for sockets to be closed....'));

                    if (context_.resultTracker.rejectedCount > 0) {
                      throw new SoloError(
                        `Account keys updates failed for ${context_.resultTracker.rejectedCount} accounts.`,
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
    } catch (error) {
      throw new SoloError(`Error in creating account: ${error.message}`, error);
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
      clusterRef: ClusterReference;
    }

    interface Context {
      config: Config;
      privateKey: PrivateKey;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            self.configManager.update(argv);

            flags.disablePrompts([flags.clusterRef]);

            const config = {
              amount: self.configManager.getFlag<number>(flags.amount),
              ecdsaPrivateKey: self.configManager.getFlag(flags.ecdsaPrivateKey),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              ed25519PrivateKey: self.configManager.getFlag(flags.ed25519PrivateKey),
              setAlias: self.configManager.getFlag<boolean>(flags.setAlias),
              generateEcdsaKey: self.configManager.getFlag<boolean>(flags.generateEcdsaKey),
              createAmount: self.configManager.getFlag<number>(flags.createAmount),
              clusterRef: self.configManager.getFlag<ClusterReference>(flags.clusterRef),
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
            context_.config = config;

            self.logger.debug('Initialized config', {config});

            await self.accountManager.loadNodeClient(
              context_.config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'create the new account',
          task: async (context_, task) => {
            const subTasks: SoloListrTask<Context>[] = [];

            for (let index = 0; index < context_.config.createAmount; index++) {
              subTasks.push({
                title: `Create accounts [${index}]`,
                task: async (context_: Context) => {
                  self.accountInfo = await self.createNewAccount(context_);
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
    } catch (error) {
      throw new SoloError(`Error in creating account: ${error.message}`, error);
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
          task: async (context_, task) => {
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
              clusterRef: self.configManager.getFlag<ClusterReference>(flags.clusterRef),
            } as UpdateAccountConfig;

            config.contextName =
              this.localConfig.clusterRefs[config.clusterRef] ?? self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            self.logger.debug('Initialized config', {config});
          },
        },
        {
          title: 'get the account info',
          task: async context_ => {
            context_.accountInfo = await self.buildAccountInfo(
              await self.getAccountInfo(context_),
              context_.config.namespace,
              !!context_.config.ed25519PrivateKey,
            );
          },
        },
        {
          title: 'update the account',
          task: async context_ => {
            if (!(await self.updateAccountInfo(context_))) {
              throw new SoloError(`An error occurred updating account ${context_.accountInfo.accountId}`);
            }
          },
        },
        {
          title: 'get the updated account info',
          task: async context_ => {
            self.accountInfo = await self.buildAccountInfo(
              await self.getAccountInfo(context_),
              context_.config.namespace,
              false,
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
    } catch (error) {
      throw new SoloError(`Error in updating account: ${error.message}`, error);
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
      clusterRef: ClusterReference;
      contextName: string;
    }

    interface Context {
      config: Config;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (context_, task) => {
            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.accountId]);

            flags.disablePrompts([flags.clusterRef]);

            const config = {
              accountId: self.configManager.getFlag(flags.accountId),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              privateKey: self.configManager.getFlag<boolean>(flags.privateKey),
              clusterRef: self.configManager.getFlag<ClusterReference>(flags.clusterRef),
            } as Config;

            config.contextName =
              this.localConfig.clusterRefs[config.clusterRef] ?? self.k8Factory.default().contexts().readCurrent();

            if (!(await this.k8Factory.getK8(config.contextName).namespaces().has(config.namespace))) {
              throw new SoloError(`namespace ${config.namespace} does not exist`);
            }

            // set config in the context for later tasks to use
            context_.config = config;

            await self.accountManager.loadNodeClient(
              config.namespace,
              self.remoteConfigManager.getClusterRefs(),
              config.deployment,
              self.configManager.getFlag<boolean>(flags.forcePortForward),
            );

            self.logger.debug('Initialized config', {config});
          },
        },
        {
          title: 'get the account info',
          task: async context_ => {
            self.accountInfo = await self.buildAccountInfo(
              await self.getAccountInfo(context_),
              context_.config.namespace,
              context_.config.privateKey,
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
    } catch (error) {
      throw new SoloError(`Error in getting account info: ${error.message}`, error);
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
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...AccountCommand.INIT_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...AccountCommand.INIT_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'account init' ===");
              self.logger.info(argv);

              await self
                .init(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account init' ===");
                  if (!r) {
                    throw new SoloError('Error running init, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error running init: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'create',
            desc: 'Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no key one will be generated for you, otherwise you may supply either a ECDSA or ED25519 private key',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...AccountCommand.CREATE_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...AccountCommand.CREATE_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'account create' ===");
              self.logger.info(argv);

              await self
                .create(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account create' ===");
                  if (!r) {
                    throw new SoloError('Error running create, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error running create: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'update',
            desc: 'Updates an existing account with the provided info, if you want to update the private key, you can supply either ECDSA or ED25519 but not both\n',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...AccountCommand.UPDATE_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...AccountCommand.UPDATE_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'account update' ===");
              self.logger.info(argv);

              await self
                .update(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account update' ===");
                  if (!r) {
                    throw new SoloError('Error running update, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error running update: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'get',
            desc: 'Gets the account info including the current amount of HBAR',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...AccountCommand.GET_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...AccountCommand.GET_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'account get' ===");
              self.logger.info(argv);

              await self
                .get(argv)
                .then(r => {
                  self.logger.info("==== Finished running 'account get' ===");
                  if (!r) {
                    throw new SoloError('Error running get, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error running get: ${error.message}`, error);
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
