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
import { Listr, ListrTaskWrapper } from 'listr2'
import { SoloError } from '../core/errors.ts'
import { BaseCommand } from './base.ts'
import * as flags from './flags.ts'
import { constants, Templates } from '../core/index.ts'
import * as prompts from './prompts.ts'
import chalk from 'chalk'
import type { Namespace } from '../core/config/remote/types.ts'
import type { ContextClusterStructure } from '../types/index.ts'

export class DeploymentCommand extends BaseCommand {
  static CREATE_DEPLOYMENT_NAME = 'createDeployment'

  static get DEPLOY_FLAGS_LIST () {
    return [ flags.namespace, flags.contextCluster ]
  }

  async create (argv: any) {
    const self = this
    const lease = self.leaseManager.instantiateLease()

    interface Config { namespace: Namespace; contextClusterUnparsed: string, contextCluster: ContextClusterStructure }
    interface Context { config: Config }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          self.logger.debug('Loaded cached config', { config: self.configManager.config })

          await prompts.execute(task, self.configManager, DeploymentCommand.DEPLOY_FLAGS_LIST)

          ctx.config = self.getConfig(DeploymentCommand.CREATE_DEPLOYMENT_NAME, DeploymentCommand.DEPLOY_FLAGS_LIST) as Config

          ctx.config.contextCluster = Templates.parseContextCluster(ctx.config.contextClusterUnparsed)

          const namespace = ctx.config.namespace

          if (await self.k8.hasNamespace(namespace)) {
            throw new SoloError(`Namespace already exists: ${namespace}` )
          }

          await self.k8.createNamespace(namespace)

          self.logger.debug('Prepared config', { config: ctx.config, cachedConfig: self.configManager.config })

          return lease.buildAcquireTask(task)
        }
      },
      {
        title: 'Validate cluster connections',
        task: async (ctx, task) => {
          const subTasks = []

          for (const cluster of Object.keys(ctx.config.contextCluster)) {
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
      self.localConfig.promptLocalConfigTask(),
      self.remoteConfigManager.buildCreateTask()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, e)
    } finally {
      await lease.release()
    }

    return true
  }

  getCommandDefinition (): { command: string; desc: string; builder: Function } {
    const networkCmd = this
    return {
      command: 'deployment',
      desc: 'Manage solo network deployment',
      builder: (yargs: any) => {
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
