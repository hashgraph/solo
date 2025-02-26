/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Listr} from 'listr2';
import {SoloError} from '../core/errors.js';
import {BaseCommand, type Opts} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import chalk from 'chalk';
import {ListrRemoteConfig} from '../core/config/remote/listr_config_tasks.js';
import {ClusterCommandTasks} from './cluster/tasks.js';
import {type ClusterRef, type DeploymentName, type NamespaceNameAsString} from '../core/config/remote/types.js';
import {type SoloListrTask} from '../types/index.js';
import {ErrorMessages} from '../core/error_messages.js';
import {splitFlagInput} from '../core/helpers.js';
import {type NamespaceName} from '../core/kube/resources/namespace/namespace_name.js';
import {type ClusterChecks} from '../core/cluster_checks.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency_injection/inject_tokens.js';
import {type AnyArgv, type AnyYargs} from '../types/aliases.js';
import {DeploymentStates} from '../core/config/remote/enumerations.js';
import {Templates} from '../core/templates.js';

export class DeploymentCommand extends BaseCommand {
  readonly tasks: ClusterCommandTasks;

  constructor(opts: Opts) {
    super(opts);

    this.tasks = new ClusterCommandTasks(this, this.k8Factory);
  }

  private static DEPLOY_FLAGS_LIST = [
    flags.quiet,
    flags.context,
    flags.namespace,
    flags.clusterRef,
    flags.userEmailAddress,
    flags.deployment,
    flags.deploymentClusters,
    flags.nodeAliasesUnparsed,
  ];

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

  public async create(argv: AnyArgv): Promise<boolean> {
    const self = this;

    interface Config {
      quiet: boolean;
      context: string;
      clusters: string[];
      namespace: NamespaceName;
      deployment: DeploymentName;
      deploymentClusters: string[];
      nodeAliases: string[];
      clusterRef: ClusterRef;
      email: string;
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

            await self.configManager.executePrompt(task, [flags.namespace, flags.deployment, flags.deploymentClusters]);
            const deploymentName = self.configManager.getFlag<DeploymentName>(flags.deployment);

            if (self.localConfig.deployments && self.localConfig.deployments[deploymentName]) {
              throw new SoloError(ErrorMessages.DEPLOYMENT_NAME_ALREADY_EXISTS(deploymentName));
            }

            ctx.config = {
              namespace: self.configManager.getFlag<NamespaceName>(flags.namespace),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              deploymentClusters: splitFlagInput(self.configManager.getFlag<string>(flags.deploymentClusters)),
              nodeAliases: splitFlagInput(self.configManager.getFlag<string>(flags.nodeAliasesUnparsed)),
              clusterRef: self.configManager.getFlag<ClusterRef>(flags.clusterRef),
              context: self.configManager.getFlag<string>(flags.context),
              email: self.configManager.getFlag<string>(flags.userEmailAddress),
            } as Config;

            self.logger.debug('Prepared config', {config: ctx.config, cachedConfig: self.configManager.config});
          },
        },
        this.setupHomeDirectoryTask(),
        this.localConfig.promptLocalConfigTask(self.k8Factory),
        {
          title: 'Add new deployment to local config',
          task: async ctx => {
            const {deployments} = this.localConfig;
            const {deployment, namespace: configNamespace, deploymentClusters} = ctx.config;
            deployments[deployment] = {
              namespace: configNamespace.name,
              clusters: deploymentClusters,
            };
            this.localConfig.setDeployments(deployments);

            // update clusterRefs
            const currentClusterRefs = this.localConfig.clusterRefs;
            currentClusterRefs[ctx.config.clusterRef] = ctx.config.context;
            this.localConfig.setClusterRefs(currentClusterRefs);

            await this.localConfig.write();
          },
        },
        this.tasks.selectContext(),
        {
          title: 'Validate context',
          task: async (ctx, task) => {
            ctx.config.context = ctx.config.context ?? self.configManager.getFlag<string>(flags.context);
            const availableContexts = self.k8Factory.default().contexts().list();

            if (availableContexts.includes(ctx.config.context)) {
              task.title += chalk.green(`- validated context ${ctx.config.context}`);
              return;
            }

            throw new SoloError(
              `Context with name ${ctx.config.context} not found, available contexts include ${availableContexts.join(', ')}`,
            );
          },
        },
        this.tasks.updateLocalConfig(),
        {
          title: 'Validate cluster connections',
          task: async (ctx, task) => {
            const subTasks: SoloListrTask<Context>[] = [];

            for (const cluster of self.localConfig.deployments[ctx.config.deployment].clusters) {
              const context = self.localConfig.clusterRefs?.[cluster];
              if (!context) continue;

              subTasks.push({
                title: `Testing connection to cluster: ${chalk.cyan(cluster)}`,
                task: async (_, task) => {
                  if (!(await self.k8Factory.default().contexts().testContextConnection(context))) {
                    task.title = `${task.title} - ${chalk.red('Cluster connection failed')}`;

                    throw new SoloError(`Cluster connection failed for: ${cluster}`);
                  }
                },
              });
            }

            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {collapseSubtasks: false},
            });
          },
        },
        ListrRemoteConfig.createRemoteConfigInMultipleClusters(this, argv),
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

  public async addCluster(argv: AnyArgv): Promise<boolean> {
    const self = this;

    interface Config {
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

            await self.configManager.executePrompt(task, [flags.deployment, flags.clusterRef]);

            ctx.config = {
              quiet: self.configManager.getFlag<boolean>(flags.quiet),
              namespace: self.configManager.getFlag<NamespaceName>(flags.namespace),
              deployment: self.configManager.getFlag<DeploymentName>(flags.deployment),
              clusterRef: self.configManager.getFlag<ClusterRef>(flags.clusterRef),

              enableCertManager: self.configManager.getFlag<boolean>(flags.enableCertManager),
              numberOfConsensusNodes: self.configManager.getFlag<number>(flags.numberOfConsensusNodes),
              dnsBaseDomain: self.configManager.getFlag(flags.dnsBaseDomain),
              dnsConsensusNodePattern: self.configManager.getFlag(flags.dnsConsensusNodePattern),
            } as Config;

            self.logger.debug('Prepared config', {config: ctx.config, cachedConfig: self.configManager.config});
          },
        },
        {
          title: 'Verify args',
          task: async (ctx, task) => {
            const {clusterRef, deployment, numberOfConsensusNodes} = ctx.config;

            if (!self.localConfig.clusterRefs.hasOwnProperty(clusterRef)) {
              throw new SoloError('Cluster ref not found in local config');
            }

            ctx.config.context = self.localConfig.clusterRefs[clusterRef];

            if (!self.localConfig.deployments.hasOwnProperty(deployment)) {
              throw new SoloError('Deployment not found in local config');
            }

            if (self.localConfig.deployments[deployment].clusters.includes(clusterRef)) {
              throw new SoloError('Cluster ref is already present for deployment');
            }

            const existingClusterRefs = self.localConfig.deployments[deployment].clusters;

            // if there is no remote config don't validate deployment state
            if (!existingClusterRefs.length) {
              ctx.config.state = DeploymentStates.PRE_GENESIS;

              if (!numberOfConsensusNodes) {
                await self.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
              }

              return;
            }

            const existingClusterContext = self.localConfig.clusterRefs[existingClusterRefs[0]];

            const remoteConfig = await self.remoteConfigManager.get(existingClusterContext);
            const state = remoteConfig.metadata.state;
            ctx.config.state = state;

            // If state is pre-genesis prompt the user for the --num-of-consensus-nodes
            if (state === DeploymentStates.PRE_GENESIS && !numberOfConsensusNodes) {
              await self.configManager.executePrompt(task, [flags.numberOfConsensusNodes]);
            }

            // if the state is post-genesis and --num-of-consensus-nodes is specified throw
            else if (state === DeploymentStates.POST_GENESIS && numberOfConsensusNodes) {
              throw new SoloError(
                `--${flags.numberOfConsensusNodes.name}=${numberOfConsensusNodes} shouldn't be specified after ${state}`,
              );
            }
          },
        },
        {
          title: 'Test connection with cluster',
          task: async (ctx, task) => {
            const {clusterRef, context} = ctx.config;

            task.title += `: ${clusterRef}, context: ${context}`;

            const isConnected = await self.k8Factory
              .getK8(context)
              .namespaces()
              .list()
              .then(() => true)
              .catch(() => false);

            if (!isConnected) {
              throw new SoloError(`Cannection failed for cluster ${clusterRef} with context: ${context}`);
            }
          },
        },
        {
          title: 'Verify prerequisites',
          task: async (ctx, task) => {
            // TODO: Verifies Kubernetes cluster & namespace-level prerequisites (e.g., cert-manager, HAProxy, etc.)
          },
        },
        {
          title: 'add cluster-ref in local config deployments',
          task: async (ctx, task) => {
            const {clusterRef, deployment} = ctx.config;

            task.title = `add cluster-ref: ${clusterRef} for deployment: ${deployment} in local config`;

            const deployments = self.localConfig.deployments;

            deployments[ctx.config.deployment].clusters.push(clusterRef);

            self.localConfig.setDeployments(deployments);
          },
        },
        {
          title: 'create remote config for deployment',
          task: async (ctx, task) => {
            const {deployment, clusterRef, context, state, numberOfConsensusNodes} = ctx.config;

            task.title += `: ${deployment} in cluster: ${clusterRef}`;
            // TODO: Create remote config

            const nodeAliasesUnparsed = Templates.renderNodeAliasesFromCount(numberOfConsensusNodes).join(',');
            self.configManager.setFlag(flags.nodeAliasesUnparsed, nodeAliasesUnparsed);

            await self.remoteConfigManager.create(argv, state);
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

  private async list(argv: AnyArgv): Promise<boolean> {
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
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...DeploymentCommand.DEPLOY_FLAGS_LIST),
            handler: (argv: AnyArgv) => {
              self.logger.info("==== Running 'deployment create' ===");
              self.logger.info(argv);

              self
                .create(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment create`====');
                  // eslint-disable-next-line n/no-process-exit
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  // eslint-disable-next-line n/no-process-exit
                  process.exit(1);
                });
            },
          })
          .command({
            command: 'list',
            desc: 'List solo deployments inside a cluster',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST),
            handler: (argv: AnyArgv) => {
              self.logger.info("==== Running 'deployment list' ===");
              self.logger.info(argv);

              self
                .list(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment list`====');
                  // eslint-disable-next-line n/no-process-exit
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  // eslint-disable-next-line n/no-process-exit
                  process.exit(1);
                });
            },
          })
          .command({
            command: 'add-cluster',
            desc: 'Adds cluster to solo deployments',
            builder: (y: AnyYargs) => flags.setCommandFlags(y, ...DeploymentCommand.ADD_CLUSTER_FLAGS_LIST),
            handler: (argv: AnyArgv) => {
              self.logger.info("==== Running 'deployment add-cluster' ===");
              self.logger.info(argv);

              self
                .addCluster(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment add-cluster`====');
                  // eslint-disable-next-line n/no-process-exit
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  // eslint-disable-next-line n/no-process-exit
                  process.exit(1);
                });
            },
          })
          .demandCommand(1, 'Select a chart command');
      },
    };
  }

  public close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
