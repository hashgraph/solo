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
import {Templates} from '../core/templates.js';
import chalk from 'chalk';
import {RemoteConfigTasks} from '../core/config/remote/remote_config_tasks.js';
import {ListrLease} from '../core/lease/listr_lease.js';
import {ClusterCommandTasks} from './cluster/tasks.js';
import type {Namespace} from '../core/config/remote/types.js';
import type {ContextClusterStructure} from '../types/config_types.js';
import type {CommandFlag} from '../types/flag_types.js';
import type {CommandBuilder} from '../types/aliases.js';
import type {Opts} from '../types/command_types.js';

export class DeploymentCommand extends BaseCommand {
  readonly tasks: ClusterCommandTasks;

  constructor(opts: Opts) {
    super(opts);

    this.tasks = new ClusterCommandTasks(this, this.k8);
  }

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
      context: string;
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
          task: async (ctx, task) => {
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
        {
          title: 'Setup home directory and cache',
          task: () => {
            this.setupHomeDirectory();
          },
        },
        this.localConfig.promptLocalConfigTask(self.k8),
        RemoteConfigTasks.createRemoteConfig.bind(this)(),
        this.tasks.selectContext(),
        {
          title: 'Validate context',
          task: async (ctx, task) => {
            ctx.config.context = ctx.config.context ?? self.configManager.getFlag<string>(flags.context);
            const availableContexts = self.k8.getContextNames();

            if (availableContexts.includes(ctx.config.context)) {
              task.title += ` - context: ${chalk.green(ctx.config.context)} is valid`;
              return;
            }

            throw new SoloError(
              `Context with name ${ctx.config.context} not found, available contexts include ${availableContexts.join(', ')}`,
            );
          },
        },
        this.tasks.updateLocalConfig(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e: Error | any) {
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
