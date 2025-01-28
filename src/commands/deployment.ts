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
import {Listr} from 'listr2';
import {SoloError} from '../core/errors.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import chalk from 'chalk';
import {ListrRemoteConfig} from '../core/config/remote/listr_config_tasks.js';
import {ClusterCommandTasks} from './cluster/tasks.js';
import type {Namespace} from '../core/config/remote/types.js';
import type {CommandFlag} from '../types/flag_types.js';
import type {CommandBuilder} from '../types/aliases.js';
import type {SoloListrTask} from '../types/index.js';
import type {Opts} from '../types/command_types.js';
import {container} from 'tsyringe-neo';

export class DeploymentCommand extends BaseCommand {
  readonly tasks: ClusterCommandTasks;

  constructor(opts: Opts) {
    super(opts);

    this.tasks = container.resolve(ClusterCommandTasks);
  }

  private static get DEPLOY_FLAGS_LIST(): CommandFlag[] {
    return [
      flags.quiet,
      flags.context,
      flags.namespace,
      flags.clusterName,
      flags.userEmailAddress,
      flags.deploymentClusters,
    ];
  }

  private async create(argv: any): Promise<boolean> {
    const self = this;

    interface Config {
      context: string;
      namespace: Namespace;
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

            await self.configManager.executePrompt(task, [flags.namespace]);

            ctx.config = {
              namespace: self.configManager.getFlag<Namespace>(flags.namespace),
            } as Config;

            self.logger.debug('Prepared config', {config: ctx.config, cachedConfig: self.configManager.config});
          },
        },
        this.setupHomeDirectoryTask(),
        this.localConfig.promptLocalConfigTask(self.k8),
        this.tasks.selectContext(),
        {
          title: 'Validate context',
          task: async (ctx, task) => {
            ctx.config.context = ctx.config.context ?? self.configManager.getFlag<string>(flags.context);
            const availableContexts = self.k8.getContextNames();

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

            for (const cluster of self.localConfig.deployments[ctx.config.namespace].clusters) {
              const context = self.localConfig.clusterContextMapping?.[cluster];
              if (!context) continue;

              subTasks.push({
                title: `Testing connection to cluster: ${chalk.cyan(cluster)}`,
                task: async (_, task) => {
                  if (!(await self.k8.testClusterConnection(context, cluster))) {
                    task.title = `${task.title} - ${chalk.red('Cluster connection failed')}`;

                    throw new SoloError(`Cluster connection failed for: ${cluster}`);
                  }
                },
              });
            }

            return task.newListr(subTasks, {
              concurrent: false,
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
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, e);
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
          .demandCommand(1, 'Select a chart command');
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
