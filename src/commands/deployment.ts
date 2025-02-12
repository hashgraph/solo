/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Listr} from 'listr2';
import {SoloError} from '../core/errors.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import chalk from 'chalk';
import {ListrRemoteConfig} from '../core/config/remote/listr_config_tasks.js';
import {ClusterCommandTasks} from './cluster/tasks.js';
import {type DeploymentName, type NamespaceNameAsString, type ClusterRef} from '../core/config/remote/types.js';
import {type CommandFlag} from '../types/flag_types.js';
import {type CommandBuilder} from '../types/aliases.js';
import {type SoloListrTask} from '../types/index.js';
import {type Opts} from '../types/command_types.js';
import {ErrorMessages} from '../core/error_messages.js';
import {splitFlagInput} from '../core/helpers.js';
import {type NamespaceName} from '../core/kube/resources/namespace/namespace_name.js';
import {type ClusterChecks} from '../core/cluster_checks.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency_injection/inject_tokens.js';

export class DeploymentCommand extends BaseCommand {
  readonly tasks: ClusterCommandTasks;

  constructor(opts: Opts) {
    super(opts);

    this.tasks = new ClusterCommandTasks(this, this.k8Factory);
  }

  private static get DEPLOY_FLAGS_LIST(): CommandFlag[] {
    return [
      flags.quiet,
      flags.context,
      flags.namespace,
      flags.clusterName,
      flags.userEmailAddress,
      flags.deployment,
      flags.deploymentClusters,
    ];
  }

  private static get LIST_DEPLOYMENTS_FLAGS_LIST(): CommandFlag[] {
    return [flags.quiet, flags.clusterName];
  }

  private async create(argv: any): Promise<boolean> {
    const self = this;

    interface Config {
      quiet: boolean;
      context: string;
      clusterName: string;
      clusters: string[];
      namespace: NamespaceName;
      deployment: DeploymentName;
      deploymentClusters: string[];
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
            } as Config;

            self.logger.debug('Prepared config', {config: ctx.config, cachedConfig: self.configManager.config});
          },
        },
        this.setupHomeDirectoryTask(),
        this.localConfig.promptLocalConfigTask(self.k8Factory),
        {
          title: 'Add new deployment to local config',
          task: async (ctx, task) => {
            const {deployments} = this.localConfig;
            const {deployment, namespace, deploymentClusters} = ctx.config;
            deployments[deployment] = {
              namespace: namespace.name,
              clusters: deploymentClusters,
            };
            this.localConfig.setDeployments(deployments);
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

  private async list(argv: any): Promise<boolean> {
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

            await self.configManager.executePrompt(task, [flags.clusterName]);

            ctx.config = {
              clusterName: self.configManager.getFlag<ClusterRef>(flags.clusterName),
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

  public getCommandDefinition(): {command: string; desc: string; builder: CommandBuilder} {
    const self = this;
    return {
      command: 'deployment',
      desc: 'Manage solo network deployment',
      builder: yargs => {
        return yargs
          .command({
            command: 'create',
            desc: 'Creates solo deployment',
            builder: y => flags.setCommandFlags(y, ...DeploymentCommand.DEPLOY_FLAGS_LIST),
            handler: argv => {
              self.logger.info("==== Running 'deployment create' ===");
              self.logger.info(argv);

              self
                .create(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment create`====');

                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .command({
            command: 'list',
            desc: 'List solo deployments inside a cluster',
            builder: y => flags.setCommandFlags(y, ...DeploymentCommand.LIST_DEPLOYMENTS_FLAGS_LIST),
            handler: argv => {
              self.logger.info("==== Running 'deployment list' ===");
              self.logger.info(argv);

              self
                .list(argv)
                .then(r => {
                  self.logger.info('==== Finished running `deployment list`====');

                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .demandCommand(1, 'Select a chart command');
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
