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
import { Listr } from 'listr2'
import { SoloError } from '../core/errors.ts'
import { BaseCommand } from './base.ts'
import * as flags from './flags.ts'
import { constants } from '../core/index.ts'
import * as prompts from './prompts.ts'
import type { Namespace } from '../core/config/remote/types.ts'

export class DeploymentCommand extends BaseCommand {
  static CREATE_DEPLOYMENT_NAME = 'createDeployment'

  static get DEPLOY_FLAGS_LIST () {
    return [ flags.namespace, flags.contextCluster ]
  }

  async create (argv: any) {
    const self = this
    const lease = self.leaseManager.instantiateLease()

    interface Config { namespace: Namespace; contextCluster: string }
    interface Context { config: Config }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          await prompts.execute(task, self.configManager, [flags.namespace, flags.contextCluster])

          self.configManager.update(argv)
          self.logger.debug('Loaded cached config', { config: self.configManager.config })

          await prompts.execute(task, self.configManager, DeploymentCommand.DEPLOY_FLAGS_LIST)

          ctx.config = self.getConfig(DeploymentCommand.CREATE_DEPLOYMENT_NAME, DeploymentCommand.DEPLOY_FLAGS_LIST) as Config

          const namespace = ctx.config.namespace

          if (await self.k8.hasNamespace(namespace)) {
            throw new SoloError(`Namespace already exists: ${namespace}` )
          }

          await self.k8.createNamespace(namespace)

          self.logger.debug('Prepared config', { config: ctx.config, cachedConfig: self.configManager.config })

          return lease.buildAcquireTask(task)
        }
      },
      self.remoteConfigManager.buildCreateRemoteConfigTask(argv),
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
