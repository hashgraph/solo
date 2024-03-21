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
import { ListrEnquirerPromptAdapter } from '@listr2/prompt-adapter-enquirer'
import { Listr } from 'listr2'
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from '../core/errors.mjs'
import { Templates, constants } from '../core/index.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as prompts from './prompts.mjs'

export class MirrorNodeCommand extends BaseCommand {
  constructor (opts) {
    super(opts)
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.accountManager = opts.accountManager
    this.profileManager = opts.profileManager
  }

  async prepareValuesArg (valuesFile, deployHederaExplorer) {
    let valuesArg = ''
    if (valuesFile) {
      valuesArg += this.prepareValuesFiles(valuesFile)
    }

    const profileName = this.configManager.getFlag(flags.profileName)
    const profileValuesFile = await this.profileManager.prepareValuesForMirrorNodeChart(profileName)
    if (profileValuesFile) {
      valuesArg += this.prepareValuesFiles(profileValuesFile)
    }

    valuesArg += ` --set hedera-mirror-node.enabled=true --set hedera-explorer.enabled=${deployHederaExplorer}`
    return valuesArg
  }

  async deploy (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace,
            flags.deployHederaExplorer
          ])

          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            chartDir: self.configManager.getFlag(flags.chartDirectory),
            deployHederaExplorer: self.configManager.getFlag(flags.deployHederaExplorer)
          }

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDir,
            constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

          ctx.config.stagingDir = Templates.renderStagingDir(self.configManager, flags)

          ctx.config.valuesArg = await self.prepareValuesArg(
            ctx.config.valuesFile,
            ctx.config.deployHederaExplorer
          )

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new FullstackTestingError(`namespace ${ctx.config.namespace} does not exist`)
          }

          await self.accountManager.loadNodeClient(ctx.config.namespace)
        }
      },
      {
        title: 'Enable mirror-node',
        task: async (ctx, parentTask) => {
          const subTasks = [
            {
              title: 'Prepare address book',
              task: async (ctx, _) => {
                ctx.addressBook = await self.accountManager.prepareAddressBookBase64()
                ctx.config.valuesArg += ` --set "hedera-mirror-node.importer.addressBook=${ctx.addressBook}"`
              }
            },
            {
              title: 'Deploy mirror-node',
              task: async (ctx, _) => {
                await self.chartManager.upgrade(
                  ctx.config.namespace,
                  constants.FULLSTACK_DEPLOYMENT_CHART,
                  ctx.config.chartPath,
                  ctx.config.valuesArg
                )
              }
            }
          ]

          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Check Mirror node components are ACTIVE',
        task: async (ctx, parentTask) => {
          const subTasks = [
            {
              title: 'Check Postgres DB',
              task: async (ctx, _) => self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
                'app.kubernetes.io/component=postgresql',
                'app.kubernetes.io/name=postgres'
              ], 1, 900)
            },
            {
              title: 'Check REST API',
              task: async (ctx, _) => self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
                'app.kubernetes.io/component=rest',
                'app.kubernetes.io/name=rest'
              ], 1, 900)
            },
            {
              title: 'Check GRPC',
              task: async (ctx, _) => self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
                'app.kubernetes.io/component=grpc',
                'app.kubernetes.io/name=grpc'
              ], 1, 900)
            },
            {
              title: 'Check Monitor',
              task: async (ctx, _) => self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
                'app.kubernetes.io/component=monitor',
                'app.kubernetes.io/name=monitor'
              ], 1, 900)
            },
            {
              title: 'Check Importer',
              task: async (ctx, _) => self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
                'app.kubernetes.io/component=importer',
                'app.kubernetes.io/name=importer'
              ], 1, 900)
            },
            {
              title: 'Check Hedera Explorer',
              skip: (ctx, _) => !ctx.config.deployHederaExplorer,
              task: async (ctx, _) => self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
                'app.kubernetes.io/component=hedera-explorer',
                'app.kubernetes.io/name=hedera-explorer'
              ], 1, 900)
            }
          ]

          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
      self.logger.debug('node start has completed')
    } catch (e) {
      throw new FullstackTestingError(`Error starting node: ${e.message}`, e)
    } finally {
      await self.accountManager.close()
    }

    return true
  }

  async destroy (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          if (!argv.force) {
            const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
              type: 'toggle',
              default: false,
              message: 'Are you sure you would like to destroy the mirror-node components?'
            })

            if (!confirm) {
              process.exit(0)
            }
          }

          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace
          ])

          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            chartDir: self.configManager.getFlag(flags.chartDirectory)
          }

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDir,
            constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

          ctx.config.stagingDir = Templates.renderStagingDir(self.configManager, flags)

          ctx.config.valuesArg = ' --set hedera-mirror-node.enabled=false --set hedera-explorer.enabled=false'

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new FullstackTestingError(`namespace ${ctx.config.namespace} does not exist`)
          }

          await self.accountManager.loadNodeClient(ctx.config.namespace)
        }
      },
      {
        title: 'Destroy mirror-node',
        task: async (ctx, _) => {
          await self.chartManager.upgrade(
            ctx.config.namespace,
            constants.FULLSTACK_DEPLOYMENT_CHART,
            ctx.config.chartPath,
            ctx.config.valuesArg
          )
        }
      },
      {
        title: 'Delete PVCs for namespace',
        task: async (ctx, _) => {
          const pvcs = await self.k8.listPvcsByNamespace(ctx.config.namespace, [
            'app.kubernetes.io/component=postgresql',
            'app.kubernetes.io/instance=fullstack-deployment',
            'app.kubernetes.io/name=postgres'
          ])

          if (pvcs) {
            for (const pvc of pvcs) {
              await self.k8.deletePvc(pvc, ctx.config.namespace)
            }
          }
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
      self.logger.debug('node start has completed')
    } catch (e) {
      throw new FullstackTestingError(`Error starting node: ${e.message}`, e)
    } finally {
      await self.accountManager.close()
    }

    return true
  }

  /**
   * Return Yargs command definition for 'mirror-mirror-node' command
   * @param mirrorNodeCmd an instance of NodeCommand
   */
  static getCommandDefinition (mirrorNodeCmd) {
    return {
      command: 'mirror-node',
      desc: 'Manage Hedera Mirror Node in fullstack testing network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy mirror-node and its components',
            builder: y => flags.setCommandFlags(y,
              flags.namespace,
              flags.deployHederaExplorer
            ),
            handler: argv => {
              mirrorNodeCmd.logger.debug('==== Running \'mirror-node deploy\' ===')
              mirrorNodeCmd.logger.debug(argv)

              mirrorNodeCmd.deploy(argv).then(r => {
                mirrorNodeCmd.logger.debug('==== Finished running `mirror-node deploy`====')
                if (!r) process.exit(1)
              }).catch(err => {
                mirrorNodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'destroy',
            desc: 'Destroy mirror-node components and database',
            builder: y => flags.setCommandFlags(y,
              flags.namespace
            ),
            handler: argv => {
              mirrorNodeCmd.logger.debug('==== Running \'mirror-node destroy\' ===')
              mirrorNodeCmd.logger.debug(argv)

              mirrorNodeCmd.destroy(argv).then(r => {
                mirrorNodeCmd.logger.debug('==== Finished running `mirror-node destroy`====')
                if (!r) process.exit(1)
              }).catch(err => {
                mirrorNodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .demandCommand(1, 'Select a mirror-node command')
      }
    }
  }
}
