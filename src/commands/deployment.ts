// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import {BaseCommand, type Options} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import chalk from 'chalk';
import {ClusterCommandTasks} from './cluster/tasks.js';
import {
  type ClusterReference,
  type DeploymentName,
  type NamespaceNameAsString,
  type Realm,
  type Shard,
} from '../core/config/remote/types.js';
import {type SoloListrTask} from '../types/index.js';
import {ErrorMessages} from '../core/error-messages.js';
import {NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {type ClusterChecks} from '../core/cluster-checks.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type ArgvStruct, type AnyYargs, type NodeAliases} from '../types/aliases.js';
import {ConsensusNodeStates, DeploymentStates} from '../core/config/remote/enumerations.js';
import {Templates} from '../core/templates.js';
import {ConsensusNodeComponent} from '../core/config/remote/components/consensus-node-component.js';
import {Cluster} from '../core/config/remote/cluster.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';

interface DeploymentAddClusterConfig {
  quiet: boolean;
  context: string;
  namespace: NamespaceName;
  deployment: DeploymentName;
  clusterRef: ClusterReference;

  enableCertManager: boolean;
  numberOfConsensusNodes: number;
  dnsBaseDomain: string;
  dnsConsensusNodePattern: string;

  state?: DeploymentStates;
  nodeAliases: NodeAliases;

  existingNodesCount: number;
  existingClusterContext?: string;
}

export interface DeploymentAddClusterContext {
  config: DeploymentAddClusterConfig;
}

export class DeploymentCommand extends BaseCommand {
  readonly tasks: ClusterCommandTasks;

  constructor(options: Options) {
    super(options);

    this.tasks = container.resolve(ClusterCommandTasks);
  }

  public static readonly COMMAND_NAME = 'deployment';

  private static CREATE_FLAGS_LIST = {
    required: [],
    optional: [flags.quiet, flags.namespace, flags.deployment, flags.realm, flags.shard],
  };

  private static DELETE_FLAGS_LIST = {
    required: [],
    optional: [flags.quiet, flags.deployment],
  };

  private static ADD_CLUSTER_FLAGS_LIST = {
    required: [],
    optional: [
      flags.quiet,
      flags.deployment,
      flags.clusterRef,
      flags.enableCertManager,
      flags.numberOfConsensusNodes,
      flags.dnsBaseDomain,
      flags.dnsConsensusNodePattern,
    ],
  };

  private static LIST_DEPLOYMENTS_FLAGS_LIST = {
    required: [],
    optional: [flags.quiet, flags.clusterRef],
  };

  /**
   * Create new deployment inside the local config
   */
  public async create(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      quiet: boolean;
      namespace: NamespaceName;
      deployment: DeploymentName;
      realm: Realm;
      shard: Shard;
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

            await self.configManager.executePrompt(task, [flags.namespace, flags.deployment]);

            context_.config = {
              quiet: self.configManager.getFlag<boolean>(flags.quiet),
              namespace: self.configManager.getFlag<NamespaceName>(flags.namespace),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              realm: self.configManager.getFlag<Realm>(flags.realm) || flags.realm.definition.defaultValue,
              shard: self.configManager.getFlag<Shard>(flags.shard) || flags.shard.definition.defaultValue,
            } as Config;

            if (self.localConfig.deployments && self.localConfig.deployments[context_.config.deployment]) {
              throw new SoloError(ErrorMessages.DEPLOYMENT_NAME_ALREADY_EXISTS(context_.config.deployment));
            }

            self.logger.debug('Prepared config', {config: context_.config, cachedConfig: self.configManager.config});
          },
        },
        {
          title: 'Add deployment to local config',
          task: async (context_, task) => {
            const {namespace, deployment, realm, shard} = context_.config;
            task.title = `Adding deployment: ${deployment} with namespace: ${namespace.name} to local config`;

            if (this.localConfig.deployments[deployment]) {
              throw new SoloError(`Deployment ${deployment} is already added to local config`);
            }

            await this.localConfig.modify(async localConfigData => {
              localConfigData.addDeployment(deployment, namespace, realm, shard);
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
    } catch (error: Error | unknown) {
      throw new SoloError('Error creating deployment', error);
    }

    return true;
  }

  /**
   * Delete a deployment from the local config
   */
  public async delete(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      quiet: boolean;
      namespace: NamespaceName;
      deployment: DeploymentName;
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

            await self.configManager.executePrompt(task, [flags.deployment]);

            context_.config = {
              quiet: self.configManager.getFlag<boolean>(flags.quiet),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
            } as Config;

            if (!self.localConfig.deployments || !self.localConfig.deployments[context_.config.deployment]) {
              throw new SoloError(ErrorMessages.DEPLOYMENT_NAME_ALREADY_EXISTS(context_.config.deployment));
            }

            self.logger.debug('Prepared config', {config: context_.config, cachedConfig: self.configManager.config});
          },
        },
        {
          title: 'Check for existing remote resources',
          task: async (context_, task) => {
            const {deployment} = context_.config;
            const clusterReferences = self.localConfig.deployments[deployment].clusters;
            for (const clusterReference of clusterReferences) {
              const context = self.localConfig.clusterRefs[clusterReference];
              const namespace = NamespaceName.of(self.localConfig.deployments[deployment].namespace);
              const remoteConfigExists = await self.remoteConfigManager.get(context);
              const namespaceExists = await self.k8Factory.getK8(context).namespaces().has(namespace);
              const existingConfigMaps = await self.k8Factory
                .getK8(context)
                .configMaps()
                .list(namespace, ['app.kubernetes.io/managed-by=Helm']);
              if (remoteConfigExists || namespaceExists || existingConfigMaps.length > 0) {
                throw new SoloError(`Deployment ${deployment} has remote resources in cluster: ${clusterReference}`);
              }
            }
          },
        },
        {
          title: 'Remove deployment from local config',
          task: async context_ => {
            const {deployment} = context_.config;

            await this.localConfig.modify(async localConfigData => {
              localConfigData.removeDeployment(deployment);
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
    } catch (error: Error | unknown) {
      throw new SoloError('Error deleting deployment', error);
    }

    return true;
  }

  /**
   * Add new cluster for specified deployment, and create or edit the remote config
   */
  public async addCluster(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    const tasks = new Listr<DeploymentAddClusterContext>(
      [
        self.initializeClusterAddConfig(argv),
        self.verifyClusterAddArgs(),
        self.checkNetworkState(),
        self.testClusterConnection(),
        self.verifyClusterAddPrerequisites(),
        self.addClusterRefToDeployments(),
        self.createOrEditRemoteConfigForNewDeployment(argv),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error: Error | unknown) {
      throw new SoloError('Error adding cluster to deployment', error);
    }

    return true;
  }

  private async list(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      clusterName: ClusterReference;
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
            self.logger.debug('Updated config with argv', {config: self.configManager.config});
            await self.configManager.executePrompt(task, [flags.clusterRef]);
            context_.config = {
              clusterName: self.configManager.getFlag<ClusterReference>(flags.clusterRef),
            } as Config;

            self.logger.debug('Prepared config', {config: context_.config, cachedConfig: self.configManager.config});
          },
        },
        {
          title: 'Validate context',
          task: async context_ => {
            const clusterName = context_.config.clusterName;

            const context = self.localConfig.clusterRefs[clusterName];

            self.k8Factory.default().contexts().updateCurrent(context);

            const namespaces = await self.k8Factory.default().namespaces().list();
            const namespacesWithRemoteConfigs: NamespaceNameAsString[] = [];

            for (const namespace of namespaces) {
              const isFound: boolean = await container
                .resolve<ClusterChecks>(InjectTokens.ClusterChecks)
                .isRemoteConfigPresentInNamespace(namespace);
              if (isFound) {
                namespacesWithRemoteConfigs.push(namespace.name);
              }
            }

            self.logger.showList(`Deployments inside cluster: ${chalk.cyan(clusterName)}`, namespacesWithRemoteConfigs);
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
    } catch (error: Error | unknown) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, error);
    }

    return true;
  }

  public getCommandDefinition() {
    const self = this;
    return {
      command: DeploymentCommand.COMMAND_NAME,
      desc: 'Manage solo network deployment',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'create',
            desc: 'Creates a solo deployment',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...DeploymentCommand.CREATE_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...DeploymentCommand.CREATE_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'deployment create' ===");
              self.logger.info(argv);

              await self
                .create(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment create`====');

                  if (!r) {
                    throw new SoloError('Error creating deployment, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error creating deployment: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'delete',
            desc: 'Deletes a solo deployment',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...DeploymentCommand.DELETE_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...DeploymentCommand.DELETE_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'deployment delete' ===");
              self.logger.info(argv);

              await self
                .delete(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment delete`====');

                  if (!r) {
                    throw new SoloError('Error deleting deployment, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error deleting deployment: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'list',
            desc: 'List solo deployments inside a cluster',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST.optional);
            },
            handler: async argv => {
              self.logger.info("==== Running 'deployment list' ===");
              self.logger.info(argv);

              await self
                .list(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment list`====');

                  if (!r) {
                    throw new SoloError('Error listing deployments, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error listing deployments: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'add-cluster',
            desc: 'Adds cluster to solo deployments',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...DeploymentCommand.ADD_CLUSTER_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...DeploymentCommand.ADD_CLUSTER_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'deployment add-cluster' ===");
              self.logger.info(argv);

              await self
                .addCluster(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment add-cluster`====');
                  if (!r) {
                    throw new SoloError('Error adding cluster deployment, expected return value to be true');
                  }
                })
                .catch(error => {
                  self.logger.showUserError(error);
                  throw new SoloError(`Error adding cluster deployment: ${error.message}`, error);
                });
            },
          })
          .demandCommand(1, 'Select a chart command');
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  /**
   * Initializes and populates the config and context for 'deployment add-cluster'
   */
  public initializeClusterAddConfig(argv: ArgvStruct): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Initialize',
      task: async (context_, task) => {
        this.configManager.update(argv);

        await this.configManager.executePrompt(task, [flags.deployment, flags.clusterRef]);

        context_.config = {
          quiet: this.configManager.getFlag<boolean>(flags.quiet),
          namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
          deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
          clusterRef: this.configManager.getFlag<ClusterReference>(flags.clusterRef),

          enableCertManager: this.configManager.getFlag<boolean>(flags.enableCertManager),
          numberOfConsensusNodes: this.configManager.getFlag<number>(flags.numberOfConsensusNodes),
          dnsBaseDomain: this.configManager.getFlag(flags.dnsBaseDomain),
          dnsConsensusNodePattern: this.configManager.getFlag(flags.dnsConsensusNodePattern),

          existingNodesCount: 0,
          nodeAliases: [] as NodeAliases,
          context: '',
        };

        this.logger.debug('Prepared config', {config: context_.config, cachedConfig: this.configManager.config});
      },
    };
  }

  /**
   * Validates:
   * - cluster ref is present in the local config's cluster-ref => context mapping
   * - the deployment is created
   * - the cluster-ref is not already added to the deployment
   */
  public verifyClusterAddArgs(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Verify args',
      task: async context_ => {
        const {clusterRef, deployment} = context_.config;

        if (!this.localConfig.clusterRefs.hasOwnProperty(clusterRef)) {
          throw new SoloError(`Cluster ref ${clusterRef} not found in local config`);
        }

        context_.config.context = this.localConfig.clusterRefs[clusterRef];

        if (!this.localConfig.deployments.hasOwnProperty(deployment)) {
          throw new SoloError(`Deployment ${deployment} not found in local config`);
        }

        if (this.localConfig.deployments[deployment].clusters.includes(clusterRef)) {
          throw new SoloError(`Cluster ref ${clusterRef} is already added for deployment`);
        }
      },
    };
  }

  /**
   * Checks the network state:
   * - if remote config is found check's the state field to see if it's pre or post genesis.
   *   - pre genesis:
   *     - prompts user if needed.
   *     - generates node aliases based on '--number-of-consensus-nodes'
   *   - post genesis:
   *     - throws if '--number-of-consensus-nodes' is passed
   * - if remote config is not found:
   *   - prompts user if needed.
   *   - generates node aliases based on '--number-of-consensus-nodes'.
   */
  public checkNetworkState(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'check network state',
      task: async (context_, task) => {
        const {deployment, numberOfConsensusNodes, quiet} = context_.config;

        const existingClusterReferences = this.localConfig.deployments[deployment].clusters;

        // if there is no remote config don't validate deployment state
        if (existingClusterReferences.length === 0) {
          context_.config.state = DeploymentStates.PRE_GENESIS;

          // if the user can't be prompted for '--num-consensus-nodes' fail
          if (!numberOfConsensusNodes && quiet) {
            throw new SoloError(`--${flags.numberOfConsensusNodes} must be specified ${DeploymentStates.PRE_GENESIS}`);
          }

          // prompt the user for the '--num-consensus-nodes'
          else if (!numberOfConsensusNodes) {
            await this.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
            context_.config.numberOfConsensusNodes = this.configManager.getFlag<number>(flags.numberOfConsensusNodes);
          }

          context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(context_.config.numberOfConsensusNodes, 0);

          return;
        }

        const existingClusterContext = this.localConfig.clusterRefs[existingClusterReferences[0]];
        context_.config.existingClusterContext = existingClusterContext;

        const remoteConfig = await this.remoteConfigManager.get(existingClusterContext);

        const state = remoteConfig.metadata.state;
        context_.config.state = state;

        const existingNodesCount = Object.keys(remoteConfig.components.consensusNodes).length;

        context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(numberOfConsensusNodes, existingNodesCount);

        // If state is pre-genesis and user can't be prompted for the '--num-consensus-nodes' fail
        if (state === DeploymentStates.PRE_GENESIS && !numberOfConsensusNodes && quiet) {
          throw new SoloError(`--${flags.numberOfConsensusNodes} must be specified ${DeploymentStates.PRE_GENESIS}`);
        }

        // If state is pre-genesis prompt the user for the '--num-consensus-nodes'
        else if (state === DeploymentStates.PRE_GENESIS && !numberOfConsensusNodes) {
          await this.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
          context_.config.numberOfConsensusNodes = this.configManager.getFlag<number>(flags.numberOfConsensusNodes);
          context_.config.nodeAliases = Templates.renderNodeAliasesFromCount(
            context_.config.numberOfConsensusNodes,
            existingNodesCount,
          );
        }

        // if the state is post-genesis and '--num-consensus-nodes' is specified throw
        else if (state === DeploymentStates.POST_GENESIS && numberOfConsensusNodes) {
          throw new SoloError(
            `--${flags.numberOfConsensusNodes.name}=${numberOfConsensusNodes} shouldn't be specified ${state}`,
          );
        }
      },
    };
  }

  /**
   * Tries to connect with the cluster using the context from the local config
   */
  public testClusterConnection(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Test cluster connection',
      task: async (context_, task) => {
        const {clusterRef, context} = context_.config;

        task.title += `: ${clusterRef}, context: ${context}`;

        const isConnected = await this.k8Factory
          .getK8(context)
          .namespaces()
          .list()
          .then(() => true)
          .catch(() => false);

        if (!isConnected) {
          throw new SoloError(`Connection failed for cluster ${clusterRef} with context: ${context}`);
        }
      },
    };
  }

  public verifyClusterAddPrerequisites(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'Verify prerequisites',
      task: async () => {
        // TODO: Verifies Kubernetes cluster & namespace-level prerequisites (e.g., cert-manager, HAProxy, etc.)
      },
    };
  }

  /**
   * Adds the new cluster-ref for the deployment in local config
   */
  public addClusterRefToDeployments(): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'add cluster-ref in local config deployments',
      task: async (context_, task) => {
        const {clusterRef, deployment} = context_.config;

        task.title = `add cluster-ref: ${clusterRef} for deployment: ${deployment} in local config`;

        await this.localConfig.modify(async localConfigData => {
          localConfigData.addClusterRefToDeployment(clusterRef, deployment);
        });
      },
    };
  }

  /**
   * - if remote config not found, create new remote config for the deployment.
   * - if remote config is found, add the new data for the deployment.
   */
  public createOrEditRemoteConfigForNewDeployment(argv: ArgvStruct): SoloListrTask<DeploymentAddClusterContext> {
    return {
      title: 'create remote config for deployment',
      task: async (context_, task) => {
        const {
          deployment,
          clusterRef,
          context,
          state,
          nodeAliases,
          namespace,
          existingClusterContext,
          dnsBaseDomain,
          dnsConsensusNodePattern,
        } = context_.config;

        argv[flags.nodeAliasesUnparsed.name] = nodeAliases.join(',');

        task.title += `: ${deployment} in cluster: ${clusterRef}`;

        if (!(await this.k8Factory.getK8(context).namespaces().has(namespace))) {
          await this.k8Factory.getK8(context).namespaces().create(namespace);
        }

        if (!existingClusterContext) {
          await this.remoteConfigManager.create(
            argv,
            state,
            nodeAliases,
            namespace,
            deployment,
            clusterRef,
            context,
            dnsBaseDomain,
            dnsConsensusNodePattern,
          );

          return;
        }

        await this.remoteConfigManager.get(existingClusterContext);

        //? Create copy of the existing remote config inside the new cluster
        await this.remoteConfigManager.createConfigMap(context);

        //? Update remote configs inside the clusters
        await this.remoteConfigManager.modify(async remoteConfig => {
          //* update the command history
          remoteConfig.addCommandToHistory(argv._.join(' '));

          //* add the new clusters
          remoteConfig.addCluster(
            new Cluster(clusterRef, namespace.name, deployment, dnsBaseDomain, dnsConsensusNodePattern),
          );

          //* add the new nodes to components
          for (const nodeAlias of nodeAliases) {
            remoteConfig.components.add(
              new ConsensusNodeComponent(
                nodeAlias,
                clusterRef,
                namespace.name,
                ConsensusNodeStates.NON_DEPLOYED,
                Templates.nodeIdFromNodeAlias(nodeAlias),
              ),
            );
          }
        });
      },
    };
  }
}
