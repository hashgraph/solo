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
import { Listr, type ListrTaskWrapper } from 'listr2'
import { SoloError } from '../core/errors.js'
import { BaseCommand } from './base.js'
import * as flags from './flags.js'
import { constants, Templates } from '../core/index.js'
import * as prompts from './prompts.js'
import chalk from 'chalk'
import { RemoteConfigTasks } from '../core/config/remote/remote_config_tasks.js'
import { ListrLease } from '../core/lease/listr_lease.js'
import type { Namespace } from '../core/config/remote/types.js'
import type { CommandFlag, ContextClusterStructure } from '../types/index.js'

export class DeploymentCommand extends BaseCommand {
  private static get DEPLOY_FLAGS_LIST (): CommandFlag[] {
    return [
      flags.namespace,
      flags.contextClusterUnparsed,
      flags.userEmailAddress,
      flags.deploymentName
    ]
  }

  private async create (argv: any): Promise<boolean> {
    const self = this
    const lease = await self.leaseManager.create()

    interface Config {
      namespace: Namespace
      contextClusterUnparsed: string
      contextCluster: ContextClusterStructure }
    interface Context { config: Config }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task): Promise<Listr<Context, any, any>> => {
          self.configManager.update(argv)
          self.logger.debug('Loaded cached config', { config: self.configManager.config })

          await prompts.execute(task, self.configManager, [flags.namespace])

          ctx.config = {
            contextClusterUnparsed: self.configManager.getFlag<string>(flags.contextClusterUnparsed),
            namespace: self.configManager.getFlag<Namespace>(flags.namespace),
          } as Config

          ctx.config.contextCluster = Templates.parseContextCluster(ctx.config.contextClusterUnparsed)

          const namespace = ctx.config.namespace

          if (!await self.k8.hasNamespace(namespace)) {
            await self.k8.createNamespace(namespace)
          }

          self.logger.debug('Prepared config', { config: ctx.config, cachedConfig: self.configManager.config })

          return ListrLease.newAcquireLeaseTask(lease, task)
        }
      },
      this.localConfig.promptLocalConfigTask(),
      {
        title: 'Validate cluster connections',
        task: async (ctx, task): Promise<Listr<Context, any, any>> => {
          const subTasks = []

          for (const cluster of Object.keys(ctx.config.contextCluster)) {
            subTasks.push({
              title: 'Cluster exists in cluster mapping',
              task: async (_: Context, task: ListrTaskWrapper<Context, any, any>): Promise<void> => {
                if (!self.localConfig.clusterMappings.hasOwnProperty(cluster)) {
                  task.title = `${task.title} - ${chalk.red('Cluster not found in mapping')}`

                  throw new SoloError(`Cluster not found in cluster mapping: ${cluster} ` +
                    `${JSON.stringify(self.localConfig.clusterMappings)}`)
                }
              }
            })

            subTasks.push({
              title: `Testing connection to cluster: ${chalk.cyan(cluster)}`,
              task: async (_: Context, task: ListrTaskWrapper<Context, any, any>) => {
                if (!await self.k8.testClusterConnection(cluster)) {
                  task.title = `${task.title} - ${chalk.red('Cluster connection failed')}`

                  throw new SoloError(`Cluster connection failed for: ${cluster}`)
                }
              }
            })
          }

          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: { collapseSubtasks: false }
          })
        }
      },
      RemoteConfigTasks.createRemoteConfig.bind(this)(),
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      console.error(e)
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, e)
    } finally {
      await lease.release()
    }

    return true
  }

  public getCommandDefinition (): { command: string; desc: string; builder: Function } {
    const networkCmd = this
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
              networkCmd.logger.debug('==== Running \'deployment create\' ===')
              networkCmd.logger.debug(argv)

              networkCmd.create(argv).then(r => {
                networkCmd.logger.debug('==== Finished running `deployment create`====')

                if (!r) process.exit(1)
              }).catch(err => {
                networkCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .demandCommand(1, 'Select a chart command')
      }
    }
  }
}
