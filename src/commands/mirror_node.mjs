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
import { constants } from '../core/index.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as prompts from './prompts.mjs'
import { getFileContents, getEnvValue } from '../core/helpers.mjs'

export class MirrorNodeCommand extends BaseCommand {
  /**
   * @param {{accountManager: AccountManager, profileManager: ProfileManager, logger: Logger, helm: Helm, k8: K8,
   * hartManager: ChartManager, configManager: ConfigManager, depManager: DependencyManager,
   * downloader: PackageDownloader}} opts
   */
  constructor (opts) {
    super(opts)
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.accountManager = opts.accountManager
    this.profileManager = opts.profileManager
  }

  /**
   * @returns {string}
   */
  static get DEPLOY_CONFIGS_NAME () {
    return 'deployConfigs'
  }

  /**
   * @returns {*[]}
   */
  static get DEPLOY_FLAGS_LIST () {
    return [
      flags.chartDirectory,
      flags.deployHederaExplorer,
      flags.fstChartVersion,
      flags.namespace,
      flags.profileFile,
      flags.profileName,
      flags.valuesFile
    ]
  }

  /**
   * @param {string} valuesFile
   * @param {boolean} deployHederaExplorer
   * @returns {Promise<string>}
   */
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

  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async deploy (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.chartDirectory,
            flags.fstChartVersion,
            flags.valuesFile
          ])

          await prompts.execute(task, self.configManager, MirrorNodeCommand.DEPLOY_FLAGS_LIST)

          /**
           * @typedef {Object} MirrorNodeDeployConfigClass
           * -- flags --
           * @property {string} chartDirectory
           * @property {boolean} deployHederaExplorer
           * @property {string} fstChartVersion
           * @property {string} namespace
           * @property {string} profileFile
           * @property {string} profileName
           * @property {string} valuesFile
           * -- extra args --
           * @property {string} chartPath
           * @property {string} valuesArg
           * -- methods --
           * @property {getUnusedConfigs} getUnusedConfigs
           */
          /**
           * @callback getUnusedConfigs
           * @returns {string[]}
           */

          ctx.config = /** @type {MirrorNodeDeployConfigClass} **/ this.getConfig(MirrorNodeCommand.DEPLOY_CONFIGS_NAME, MirrorNodeCommand.DEPLOY_FLAGS_LIST,
            ['chartPath', 'valuesArg'])

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDirectory,
            constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

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
                ctx.addressBook = await self.accountManager.prepareAddressBookBase64(ctx.config.namespace)
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
                  ctx.config.valuesArg,
                  ctx.config.fstChartVersion
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
        title: 'Check pods are ready',
        task: async (ctx, parentTask) => {
          const subTasks = [
            {
              title: 'Check Postgres DB',
              task: async (ctx, _) => self.k8.waitForPodReady([
                'app.kubernetes.io/component=postgresql',
                'app.kubernetes.io/name=postgres'
              ], 1, 300, 2000)
            },
            {
              title: 'Check REST API',
              task: async (ctx, _) => self.k8.waitForPodReady([
                'app.kubernetes.io/component=rest',
                'app.kubernetes.io/name=rest'
              ], 1, 300, 2000)
            },
            {
              title: 'Check GRPC',
              task: async (ctx, _) => self.k8.waitForPodReady([
                'app.kubernetes.io/component=grpc',
                'app.kubernetes.io/name=grpc'
              ], 1, 300, 2000)
            },
            {
              title: 'Check Monitor',
              task: async (ctx, _) => self.k8.waitForPodReady([
                'app.kubernetes.io/component=monitor',
                'app.kubernetes.io/name=monitor'
              ], 1, 300, 2000)
            },
            {
              title: 'Check Importer',
              task: async (ctx, _) => self.k8.waitForPodReady([
                'app.kubernetes.io/component=importer',
                'app.kubernetes.io/name=importer'
              ], 1, 300, 2000)
            },
            {
              title: 'Check Hedera Explorer',
              skip: (ctx, _) => !ctx.config.deployHederaExplorer,
              task: async (ctx, _) => self.k8.waitForPodReady([
                'app.kubernetes.io/component=hedera-explorer',
                'app.kubernetes.io/name=hedera-explorer'
              ], 1, 300, 2000)
            }
          ]

          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Seed DB data',
        task: async (ctx, parentTask) => {
          const subTasks = [
            {
              title: 'Insert data in public.file_data',
              task: async (ctx, _) => {
                const namespace = self.configManager.getFlag(flags.namespace)

                const feesFileIdNum = 111
                const exchangeRatesFileIdNum = 112
                const timestamp = Date.now()

                const fees = await getFileContents(this.accountManager, namespace, feesFileIdNum)
                const exchangeRates = await getFileContents(this.accountManager, namespace, exchangeRatesFileIdNum)

                const importFeesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id, transaction_type) VALUES (decode('${fees}', 'hex'), ${timestamp + '000000'}, ${feesFileIdNum}, 17);`
                const importExchangeRatesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id, transaction_type) VALUES (decode('${exchangeRates}', 'hex'), ${
                    timestamp + '000001'
                }, ${exchangeRatesFileIdNum}, 17);`
                const sqlQuery = [importFeesQuery, importExchangeRatesQuery].join('\n')

                const pods = await this.k8.getPodsByLabel(['app.kubernetes.io/name=postgres'])
                if (pods.length === 0) {
                  throw new FullstackTestingError('postgres pod not found')
                }
                const postgresPodName = pods[0].metadata.name
                const postgresContainerName = 'postgresql'
                const mirrorEnvVars = await self.k8.execContainer(postgresPodName, postgresContainerName, '/bin/bash -c printenv')
                const mirrorEnvVarsArray = mirrorEnvVars.split('\n')
                const HEDERA_MIRROR_IMPORTER_DB_OWNER = getEnvValue(mirrorEnvVarsArray, 'HEDERA_MIRROR_IMPORTER_DB_OWNER')
                const HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD = getEnvValue(mirrorEnvVarsArray, 'HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD')
                const HEDERA_MIRROR_IMPORTER_DB_NAME = getEnvValue(mirrorEnvVarsArray, 'HEDERA_MIRROR_IMPORTER_DB_NAME')

                await self.k8.execContainer(postgresPodName, postgresContainerName, [
                  'psql',
                  `postgresql://${HEDERA_MIRROR_IMPORTER_DB_OWNER}:${HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD}@localhost:5432/${HEDERA_MIRROR_IMPORTER_DB_NAME}`,
                  '-c',
                  sqlQuery
                ])
              }
            }
          ]

          return parentTask.newListr(subTasks, {
            concurrent: false,
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

  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
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
            chartDirectory: self.configManager.getFlag(flags.chartDirectory),
            fstChartVersion: this.configManager.getFlag(flags.fstChartVersion),
            namespace: self.configManager.getFlag(flags.namespace)
          }

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDirectory,
            constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

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
            ctx.config.valuesArg,
            ctx.config.fstChartVersion
          )
        }
      },
      {
        title: 'Delete PVCs',
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
   * @param {MirrorNodeCommand} mirrorNodeCmd an instance of NodeCommand
   * @returns {{command: string, desc: string, builder: Function}}
   */
  static getCommandDefinition (mirrorNodeCmd) {
    if (!mirrorNodeCmd || !(mirrorNodeCmd instanceof MirrorNodeCommand)) {
      throw new IllegalArgumentError('Invalid MirrorNodeCommand instance', mirrorNodeCmd)
    }
    return {
      command: 'mirror-node',
      desc: 'Manage Hedera Mirror Node in fullstack testing network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy mirror-node and its components',
            builder: y => flags.setCommandFlags(y, ...MirrorNodeCommand.DEPLOY_FLAGS_LIST),
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
              flags.chartDirectory,
              flags.force,
              flags.fstChartVersion,
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
