/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Listr} from 'listr2';
import {SoloError} from '../core/errors.js';
import {BaseCommand, type Opts} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import chalk from 'chalk';
import {ClusterCommandTasks} from './cluster/tasks.js';
import {type ClusterRef, type DeploymentName, type NamespaceNameAsString} from '../core/config/remote/types.js';
import {type SoloListrTask} from '../types/index.js';
import {ErrorMessages} from '../core/error_messages.js';
import {type NamespaceName} from '../core/kube/resources/namespace/namespace_name.js';
import {type ClusterChecks} from '../core/cluster_checks.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency_injection/inject_tokens.js';
import {type ArgvStruct, type AnyYargs, type NodeAliases} from '../types/aliases.js';
import {ConsensusNodeStates, DeploymentStates} from '../core/config/remote/enumerations.js';
import {Templates} from '../core/templates.js';
import {ConsensusNodeComponent} from '../core/config/remote/components/consensus_node_component.js';
import {Cluster} from '../core/config/remote/cluster.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';

interface DeploymentAddClusterConfig {
  quiet: boolean;
  context: string;
  namespace: NamespaceName;
  deployment: DeploymentName;
  clusterRef: ClusterRef;

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

  constructor(opts: Opts) {
    super(opts);

    this.tasks = container.resolve(ClusterCommandTasks);
  }

  private static CREATE_FLAGS_LIST = [flags.quiet, flags.namespace, flags.deployment];

  private static ADD_CLUSTER_FLAGS_LIST = [
    flags.quiet,
    flags.deployment,
    flags.clusterRef,
    flags.enableCertManager,
    flags.numberOfConsensusNodes,
    flags.dnsBaseDomain,
    flags.dnsConsensusNodePattern,
  ];

  private static LIST_DEPLOYMENTS_FLAGS_LIST = [flags.quiet, flags.clusterRef];

  /**
   * Create new deployment inside the local config
   */
  public async create(argv: ArgvStruct): Promise<boolean> {
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
          task: async (ctx, task) => {
            self.configManager.update(argv);

            await self.configManager.executePrompt(task, [flags.namespace, flags.deployment]);

            ctx.config = {
              quiet: self.configManager.getFlag<boolean>(flags.quiet),
              namespace: self.configManager.getFlag<NamespaceName>(flags.namespace),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
            } as Config;

            if (self.localConfig.deployments && self.localConfig.deployments[ctx.config.deployment]) {
              throw new SoloError(ErrorMessages.DEPLOYMENT_NAME_ALREADY_EXISTS(ctx.config.deployment));
            }

            self.logger.debug('Prepared config', {config: ctx.config, cachedConfig: self.configManager.config});
          },
        },
        {
          title: 'Add deployment to local config',
          task: async (ctx, task) => {
            const {namespace, deployment} = ctx.config;
            task.title = `Adding deployment: ${deployment} with namespace: ${namespace.name} to local config`;

            if (this.localConfig.deployments[deployment]) {
              throw new SoloError(`Deployment ${deployment} is already added to local config`);
            }

            this.localConfig.deployments[deployment] = {clusters: [], namespace: namespace.name};
            await this.localConfig.write();
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
    } catch (e: Error | unknown) {
      throw new SoloError('Error creating deployment', e);
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
    } catch (e: Error | unknown) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, e);
    }

    return true;
  }

  private async list(argv: ArgvStruct): Promise<boolean> {
    const self = this;

    interface Config {
      clusterName: ClusterRef;
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
            self.logger.debug('Updated config with argv', {config: self.configManager.config});

            await self.configManager.executePrompt(task, [flags.clusterRef]);

            ctx.config = {
              clusterName: self.configManager.getFlag<ClusterRef>(flags.clusterRef),
            } as Config;

            self.logger.debug('Prepared config', {config: ctx.config, cachedConfig: self.configManager.config});
          },
        },
        {
          title: 'Validate context',
          task: async ctx => {
            const clusterName = ctx.config.clusterName;

            const context = self.localConfig.clusterRefs[clusterName];

            self.k8Factory.default().contexts().updateCurrent(context);

            const namespaces = await self.k8Factory.default().namespaces().list();
            const namespacesWithRemoteConfigs: NamespaceNameAsString[] = [];

            for (const namespace of namespaces) {
              const isFound: boolean = await container
                .resolve<ClusterChecks>(InjectTokens.ClusterChecks)
                .isRemoteConfigPresentInNamespace(namespace);
              if (isFound) namespacesWithRemoteConfigs.push(namespace.name);
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
    } catch (e: Error | unknown) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, e);
    }

    return true;
  }

  public getCommandDefinition() {
    const self = this;
    return {
      command: 'deployment',
      desc: 'Manage solo network deployment',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'create',
            desc: 'Creates solo deployment',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...DeploymentCommand.CREATE_FLAGS_LIST),
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'deployment create' ===");
              self.logger.info(argv);

              await self
                .create(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment create`====');

                  if (!r) throw new SoloError('Error creating deployment, expected return value to be true');
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  throw new SoloError(`Error creating deployment: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'list',
            desc: 'List solo deployments inside a cluster',
            builder: y => flags.setCommandFlags(y, ...DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST),
            handler: async argv => {
              self.logger.info("==== Running 'deployment list' ===");
              self.logger.info(argv);

              await self
                .list(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment list`====');

                  if (!r) throw new SoloError('Error listing deployments, expected return value to be true');
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  throw new SoloError(`Error listing deployments: ${err.message}`, err);
                });
            },
          })
          .command({
            command: 'add-cluster',
            desc: 'Adds cluster to solo deployments',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...DeploymentCommand.ADD_CLUSTER_FLAGS_LIST),
            handler: async (argv: ArgvStruct) => {
              self.logger.info("==== Running 'deployment add-cluster' ===");
              self.logger.info(argv);

              await self
                .addCluster(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment add-cluster`====');
                  if (!r) throw new SoloError('Error adding cluster deployment, expected return value to be true');
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  throw new SoloError(`Error adding cluster deployment: ${err.message}`, err);
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
      task: async (ctx, task) => {
        this.configManager.update(argv);

        await this.configManager.executePrompt(task, [flags.deployment, flags.clusterRef]);

        ctx.config = {
          quiet: this.configManager.getFlag<boolean>(flags.quiet),
          namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
          deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
          clusterRef: this.configManager.getFlag<ClusterRef>(flags.clusterRef),

          enableCertManager: this.configManager.getFlag<boolean>(flags.enableCertManager),
          numberOfConsensusNodes: this.configManager.getFlag<number>(flags.numberOfConsensusNodes),
          dnsBaseDomain: this.configManager.getFlag(flags.dnsBaseDomain),
          dnsConsensusNodePattern: this.configManager.getFlag(flags.dnsConsensusNodePattern),

          existingNodesCount: 0,
          nodeAliases: [] as NodeAliases,
          context: '',
        };

        this.logger.debug('Prepared config', {config: ctx.config, cachedConfig: this.configManager.config});
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
      task: async ctx => {
        const {clusterRef, deployment} = ctx.config;

        if (!this.localConfig.clusterRefs.hasOwnProperty(clusterRef)) {
          throw new SoloError(`Cluster ref ${clusterRef} not found in local config`);
        }

        ctx.config.context = this.localConfig.clusterRefs[clusterRef];

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
      task: async (ctx, task) => {
        const {deployment, numberOfConsensusNodes, quiet} = ctx.config;

        const existingClusterRefs = this.localConfig.deployments[deployment].clusters;

        // if there is no remote config don't validate deployment state
        if (!existingClusterRefs.length) {
          ctx.config.state = DeploymentStates.PRE_GENESIS;

          // if the user can't be prompted for '--num-of-consensus-nodes' fail
          if (!numberOfConsensusNodes && quiet) {
            throw new SoloError(`--${flags.numberOfConsensusNodes} must be specified ${DeploymentStates.PRE_GENESIS}`);
          }

          // prompt the user for the '--num-of-consensus-nodes'
          else if (!numberOfConsensusNodes) {
            await this.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
            ctx.config.numberOfConsensusNodes = this.configManager.getFlag<number>(flags.numberOfConsensusNodes);
          }

          ctx.config.nodeAliases = Templates.renderNodeAliasesFromCount(numberOfConsensusNodes, 0);

          return;
        }

        const existingClusterContext = this.localConfig.clusterRefs[existingClusterRefs[0]];
        ctx.config.existingClusterContext = existingClusterContext;

        const remoteConfig = await this.remoteConfigManager.get(existingClusterContext);

        const state = remoteConfig.metadata.state;
        ctx.config.state = state;

        const existingNodesCount = Object.keys(remoteConfig.components.consensusNodes).length + 1;
        ctx.config.nodeAliases = Templates.renderNodeAliasesFromCount(numberOfConsensusNodes, existingNodesCount);

        // If state is pre-genesis and user can't be prompted for the '--num-of-consensus-nodes' fail
        if (state === DeploymentStates.PRE_GENESIS && !numberOfConsensusNodes && quiet) {
          throw new SoloError(`--${flags.numberOfConsensusNodes} must be specified ${DeploymentStates.PRE_GENESIS}`);
        }

        // If state is pre-genesis prompt the user for the '--num-of-consensus-nodes'
        else if (state === DeploymentStates.PRE_GENESIS && !numberOfConsensusNodes) {
          await this.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
          ctx.config.numberOfConsensusNodes = this.configManager.getFlag<number>(flags.numberOfConsensusNodes);
        }

        // if the state is post-genesis and '--num-of-consensus-nodes' is specified throw
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
      task: async (ctx, task) => {
        const {clusterRef, context} = ctx.config;

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
      task: async (ctx, task) => {
        const {clusterRef, deployment} = ctx.config;

        task.title = `add cluster-ref: ${clusterRef} for deployment: ${deployment} in local config`;

        const deployments = this.localConfig.deployments;

        deployments[deployment].clusters.push(clusterRef);

        this.localConfig.setDeployments(deployments);
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
      task: async (ctx, task) => {
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
        } = ctx.config;

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
