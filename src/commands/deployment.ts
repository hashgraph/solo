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
import {Listr, type ListrTaskWrapper} from 'listr2';
import {SoloError} from '../core/errors.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import {Templates} from '../core/templates.js';
import chalk from 'chalk';
import {RemoteConfigTasks} from '../core/config/remote/remote_config_tasks.js';
import {ListrLease} from '../core/lease/listr_lease.js';
import type {Namespace} from '../core/config/remote/types.js';
import {type ContextClusterStructure} from '../types/config_types.js';
import {type CommandFlag} from '../types/flag_types.js';
import {type CommandBuilder} from '../types/aliases.js';
import {splitFlagInput} from '../core/helpers.js';
import {promptForContext, selectContextForFirstCluster} from './context/context-helpers.js';

export class DeploymentCommand extends BaseCommand {
  private static get DEPLOY_FLAGS_LIST(): CommandFlag[] {
    return [
      flags.quiet,
      flags.context,
      flags.namespace,
      flags.userEmailAddress,
      flags.deploymentClusters,
      flags.contextClusterUnparsed,
    ];
  }

  private async create(argv: any): Promise<boolean> {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Config {
      namespace: Namespace;
      contextClusterUnparsed: string;
      contextCluster: ContextClusterStructure;
    }
    interface Context {
      config: Config;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task): Promise<Listr<Context, any, any>> => {
            self.configManager.update(argv);
            self.logger.debug('Updated config with argv', {config: self.configManager.config});

            await self.configManager.executePrompt(task, [
              flags.contextClusterUnparsed,
              flags.namespace,
              flags.deploymentClusters,
            ]);

            ctx.config = {
              contextClusterUnparsed: self.configManager.getFlag<string>(flags.contextClusterUnparsed),
              namespace: self.configManager.getFlag<Namespace>(flags.namespace),
            } as Config;

            ctx.config.contextCluster = Templates.parseContextCluster(ctx.config.contextClusterUnparsed);

            const namespace = ctx.config.namespace;

            if (!(await self.k8.hasNamespace(namespace))) {
              await self.k8.createNamespace(namespace);
            }

            self.logger.debug('Prepared config', {config: ctx.config, cachedConfig: self.configManager.config});

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        this.localConfig.promptLocalConfigTask(self.k8),
        {
          title: 'Validate cluster connections',
          task: async (ctx, task): Promise<Listr<Context, any, any>> => {
            const subTasks = [];

            for (const cluster of Object.keys(ctx.config.contextCluster)) {
              subTasks.push({
                title: `Testing connection to cluster: ${chalk.cyan(cluster)}`,
                task: async (_: Context, task: ListrTaskWrapper<Context, any, any>) => {
                  if (!(await self.k8.testClusterConnection(cluster))) {
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
        RemoteConfigTasks.createRemoteConfig.bind(this)(),
        {
          title: 'Select provided context',
          task: async (ctx, task) => {
            self.logger.info('Read local configuration settings...');
            const isQuiet = self.configManager.getFlag<boolean>(flags.quiet);
            const deploymentName = self.configManager.getFlag<Namespace>(flags.namespace);
            let clusters = splitFlagInput(self.configManager.getFlag(flags.clusterName));
            const contexts = splitFlagInput(self.configManager.getFlag(flags.context));
            const localConfig = self.getLocalConfig();

            let selectedContext;

            // If one or more contexts are provided, use the first one
            if (contexts.length) {
              selectedContext = contexts[0];
            }

            // If one or more clusters are provided, use the first one to determine the context
            // from the mapping in the LocalConfig
            else if (clusters.length) {
              selectedContext = await selectContextForFirstCluster(task, clusters, localConfig, isQuiet, self.k8);
            }

            // If a deployment name is provided, get the clusters associated with the deployment from the LocalConfig
            // and select the context from the mapping, corresponding to the first deployment cluster
            else if (deploymentName) {
              const deployment = localConfig.deployments[deploymentName];

              if (deployment && deployment.clusters.length) {
                selectedContext = await selectContextForFirstCluster(
                  task,
                  deployment.clusters,
                  localConfig,
                  isQuiet,
                  self.k8,
                );
              }

              // The provided deployment does not exist in the LocalConfig
              else {
                // Add the deployment to the LocalConfig with the currently selected cluster and context in KubeConfig
                if (isQuiet) {
                  selectedContext = self.k8.getKubeConfig().getCurrentContext();
                  const selectedCluster = self.k8.getKubeConfig().getCurrentCluster().name;
                  localConfig.deployments[deploymentName] = {
                    clusters: [selectedCluster],
                  };

                  if (!localConfig.clusterContextMapping[selectedCluster]) {
                    localConfig.clusterContextMapping[selectedCluster] = selectedContext;
                  }
                }

                // Prompt user for clusters and contexts
                else {
                  clusters = splitFlagInput(await flags.clusterName.prompt(task, clusters));

                  for (const cluster of clusters) {
                    if (!localConfig.clusterContextMapping[cluster]) {
                      localConfig.clusterContextMapping[cluster] = await promptForContext(task, cluster, self.k8);
                    }
                  }

                  selectedContext = localConfig.clusterContextMapping[clusters[0]];
                }
              }
            }

            self.k8.getKubeConfig().setCurrentContext(selectedContext);
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
    } finally {
      await lease.release();
    }

    return true;
  }

  public getCommandDefinition(): {command: string; desc: string; builder: CommandBuilder} {
    const self = this;
    return {
      command: 'deployment',
      desc: 'Manage solo network deployment',
      builder: (yargs: any): any => {
        return yargs
          .command({
            command: 'create',
            desc: 'Creates solo deployment',
            builder: (y: any) => flags.setCommandFlags(y, ...DeploymentCommand.DEPLOY_FLAGS_LIST),
            handler: (argv: any) => {
              self.logger.debug("==== Running 'deployment create' ===");
              self.logger.debug(argv);

              self
                .create(argv)
                .then(r => {
                  self.logger.debug('==== Finished running `deployment create`====');

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
