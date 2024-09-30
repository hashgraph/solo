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
'use strict'
import { ListrEnquirerPromptAdapter } from '@listr2/prompt-adapter-enquirer'
import chalk from 'chalk'
import { Listr } from 'listr2'
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from '../core/errors.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import { constants, Templates } from '../core/index.mjs'
import * as prompts from './prompts.mjs'
import * as helpers from '../core/helpers.mjs'
import path from 'path'
import { addDebugOptions, validatePath } from '../core/helpers.mjs'
import fs from 'fs'

export class NetworkCommand extends BaseCommand {
  /**
   * @param {{profileManager: ProfileManager, logger: Logger, helm: Helm, k8: K8, chartManager: ChartManager,
   * configManager: ConfigManager, depManager: DependencyManager, downloader: PackageDownloader}} opts
   */
  constructor (opts) {
    super(opts)

    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required')
    if (!opts || !opts.keyManager) throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager)
    if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)
    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.k8 = opts.k8
    this.keyManager = opts.keyManager
    this.platformInstaller = opts.platformInstaller
    this.profileManager = opts.profileManager
  }

  /**
   * @returns {string}
   */
  static get DEPLOY_CONFIGS_NAME () {
    return 'deployConfigs'
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get DEPLOY_FLAGS_LIST () {
    return [
      flags.apiPermissionProperties,
      flags.app,
      flags.applicationEnv,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.enablePrometheusSvcMonitor,
      flags.fstChartVersion,
      flags.debugNodeId,
      flags.log4j2Xml,
      flags.namespace,
      flags.nodeIDs,
      flags.persistentVolumeClaims,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.releaseTag,
      flags.settingTxt,
      flags.valuesFile
    ]
  }

  /**
   * @param {Object} config
   * @returns {Promise<string>}
   */
  async prepareValuesArg (config = {}) {
    let valuesArg = ''
    if (config.chartDirectory) {
      valuesArg = `-f ${path.join(config.chartDirectory, 'fullstack-deployment', 'values.yaml')}`
    }

    if (config.app !== constants.HEDERA_APP_NAME) {
      const index = config.nodeIds.length
      for (let i = 0; i < index; i++) {
        valuesArg += ` --set "hedera.nodes[${i}].root.extraEnv[0].name=JAVA_MAIN_CLASS"`
        valuesArg += ` --set "hedera.nodes[${i}].root.extraEnv[0].value=com.swirlds.platform.Browser"`
      }
      valuesArg = addDebugOptions(valuesArg, config.debugNodeId, 1)
    } else {
      valuesArg = addDebugOptions(valuesArg, config.debugNodeId)
    }

    const profileName = this.configManager.getFlag(flags.profileName)
    this.profileValuesFile = await this.profileManager.prepareValuesForFstChart(profileName)
    if (this.profileValuesFile) {
      valuesArg += this.prepareValuesFiles(this.profileValuesFile)
    }

    // do not deploy mirror node until after we have the updated address book
    valuesArg += ' --set "hedera-mirror-node.enabled=false" --set "hedera-explorer.enabled=false"'
    valuesArg += ` --set "telemetry.prometheus.svcMonitor.enabled=${config.enablePrometheusSvcMonitor}"`

    if (config.releaseTag) {
      const rootImage = helpers.getRootImageRepository(config.releaseTag)
      valuesArg += ` --set "defaults.root.image.repository=${rootImage}"`
    }

    valuesArg += ` --set "defaults.volumeClaims.enabled=${config.persistentVolumeClaims}"`

    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile)
    }

    this.logger.debug('Prepared helm chart values', { valuesArg })
    return valuesArg
  }

  /**
   * @param task
   * @param {Object} argv
   * @returns {Promise<NetworkDeployConfigClass>}
   */
  async prepareConfig (task, argv) {
    this.configManager.update(argv)
    this.logger.debug('Loaded cached config', { config: this.configManager.config })

    // disable the prompts that we don't want to prompt the user for
    prompts.disablePrompts([
      flags.apiPermissionProperties,
      flags.app,
      flags.applicationEnv,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.cacheDir,
      flags.chainId,
      flags.debugNodeId,
      flags.log4j2Xml,
      flags.persistentVolumeClaims,
      flags.profileName,
      flags.profileFile,
      flags.settingTxt
    ])

    await prompts.execute(task, this.configManager, NetworkCommand.DEPLOY_FLAGS_LIST)

    /**
     * @typedef {Object} NetworkDeployConfigClass
     * -- flags --
     * @property {string} applicationEnv
     * @property {string} cacheDir
     * @property {string} chartDirectory
     * @property {boolean} enablePrometheusSvcMonitor
     * @property {string} fstChartVersion
     * @property {string} namespace
     * @property {string} nodeIDs
     * @property {string} persistentVolumeClaims
     * @property {string} profileFile
     * @property {string} profileName
     * @property {string} releaseTag
     * -- extra args --
     * @property {string} chartPath
     * @property {string} keysDir
     * @property {string[]} nodeIds
     * @property {string} stagingDir
     * @property {string} stagingKeysDir
     * @property {string} valuesArg
     * -- methods --
     * @property {getUnusedConfigs} getUnusedConfigs
     */
    /**
     * @callback getUnusedConfigs
     * @returns {string[]}
     */

    // create a config object for subsequent steps
    const config = /** @type {NetworkDeployConfigClass} **/ this.getConfig(NetworkCommand.DEPLOY_CONFIGS_NAME, NetworkCommand.DEPLOY_FLAGS_LIST,
      [
        'chartPath',
        'keysDir',
        'nodeIds',
        'stagingDir',
        'stagingKeysDir',
        'valuesArg'
      ])

    config.nodeIds = helpers.parseNodeIds(config.nodeIDs)

    // compute values
    config.chartPath = await this.prepareChartPath(config.chartDirectory,
      constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

    config.valuesArg = await this.prepareValuesArg(config)

    // compute other config parameters
    config.keysDir = path.join(validatePath(config.cacheDir), 'keys')
    config.stagingDir = Templates.renderStagingDir(
      config.cacheDir,
      config.releaseTag
    )
    config.stagingKeysDir = path.join(validatePath(config.stagingDir), 'keys')

    if (!await this.k8.hasNamespace(config.namespace)) {
      await this.k8.createNamespace(config.namespace)
    }

    // prepare staging keys directory
    if (!fs.existsSync(config.stagingKeysDir)) {
      fs.mkdirSync(config.stagingKeysDir, { recursive: true })
    }

    // create cached keys dir if it does not exist yet
    if (!fs.existsSync(config.keysDir)) {
      fs.mkdirSync(config.keysDir)
    }

    this.logger.debug('Prepared config', {
      config,
      cachedConfig: this.configManager.config
    })
    return config
  }

  /**
   * Run helm install and deploy network components
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async deploy (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          ctx.config = /** @type {NetworkDeployConfigClass} **/ await self.prepareConfig(task, argv)
        }
      },
      {
        title: 'Prepare staging directory',
        task: async (ctx, parentTask) => {
          const subTasks = [
            {
              title: 'Copy Gossip keys to staging',
              task: async (ctx, _) => {
                const config = /** @type {NetworkDeployConfigClass} **/ ctx.config

                await this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, config.nodeIds)
              }
            },
            {
              title: 'Copy gRPC TLS keys to staging',
              task: async (ctx, _) => {
                const config = /** @type {NetworkDeployConfigClass} **/ ctx.config
                for (const nodeId of config.nodeIds) {
                  const tlsKeyFiles = self.keyManager.prepareTLSKeyFilePaths(nodeId, config.keysDir)
                  await self.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir)
                }
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
        title: 'Copy node keys to secrets',
        task: async (ctx, parentTask) => {
          const config = /** @type {NetworkDeployConfigClass} **/ ctx.config

          const subTasks = self.platformInstaller.copyNodeKeys(config.stagingDir, config.nodeIds)

          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: `Install chart '${constants.FULLSTACK_DEPLOYMENT_CHART}'`,
        task: async (ctx, _) => {
          const config = /** @type {NetworkDeployConfigClass} **/ ctx.config
          if (await self.chartManager.isChartInstalled(config.namespace, constants.FULLSTACK_DEPLOYMENT_CHART)) {
            await self.chartManager.uninstall(config.namespace, constants.FULLSTACK_DEPLOYMENT_CHART)
          }

          await this.chartManager.install(
            config.namespace,
            constants.FULLSTACK_DEPLOYMENT_CHART,
            config.chartPath,
            config.fstChartVersion,
            config.valuesArg)
        }
      },
      {
        title: 'Check node pods are running',
        task:
          async (ctx, task) => {
            const subTasks = []
            const config = /** @type {NetworkDeployConfigClass} **/ ctx.config

            // nodes
            for (const nodeId of config.nodeIds) {
              subTasks.push({
                title: `Check Node: ${chalk.yellow(nodeId)}`,
                task: async () =>
                  await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
                    'fullstack.hedera.com/type=network-node',
                    `fullstack.hedera.com/node-name=${nodeId}`
                  ], 1, 60 * 15, 1000) // timeout 15 minutes
              })
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
              rendererOptions: {
                collapseSubtasks: false
              }
            })
          }
      },
      {
        title: 'Check proxy pods are running',
        task:
          async (ctx, task) => {
            const subTasks = []
            const config = /** @type {NetworkDeployConfigClass} **/ ctx.config

            // HAProxy
            for (const nodeId of config.nodeIds) {
              subTasks.push({
                title: `Check HAProxy for: ${chalk.yellow(nodeId)}`,
                task: async () =>
                  await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
                    'fullstack.hedera.com/type=haproxy'
                  ], 1, 60 * 15, 1000) // timeout 15 minutes
              })
            }

            // Envoy Proxy
            for (const nodeId of config.nodeIds) {
              subTasks.push({
                title: `Check Envoy Proxy for: ${chalk.yellow(nodeId)}`,
                task: async () =>
                  await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
                    'fullstack.hedera.com/type=envoy-proxy'
                  ], 1, 60 * 15, 1000) // timeout 15 minutes
              })
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false
              }
            })
          }
      },
      {
        title: 'Check auxiliary pods are ready',
        task:
          async (ctx, task) => {
            const subTasks = []

            // minio
            subTasks.push({
              title: 'Check MinIO',
              task: async () =>
                await self.k8.waitForPodReady([
                  'v1.min.io/tenant=minio'
                ], 1, 60 * 5, 1000) // timeout 5 minutes
            })

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
              rendererOptions: {
                collapseSubtasks: false
              }
            })
          }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError(`Error installing chart ${constants.FULLSTACK_DEPLOYMENT_CHART}`, e)
    }

    return true
  }

  /**
   * Run helm uninstall and destroy network components
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
              message: 'Are you sure you would like to destroy the network components?'
            })

            if (!confirm) {
              process.exit(0)
            }
          }

          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.deletePvcs,
            flags.deleteSecrets,
            flags.namespace
          ])

          ctx.config = {
            deletePvcs: self.configManager.getFlag(flags.deletePvcs),
            deleteSecrets: self.configManager.getFlag(flags.deleteSecrets),
            namespace: self.configManager.getFlag(flags.namespace)
          }
        }
      },
      {
        title: `Uninstall chart ${constants.FULLSTACK_DEPLOYMENT_CHART}`,
        task: async (ctx, _) => {
          await self.chartManager.uninstall(ctx.config.namespace, constants.FULLSTACK_DEPLOYMENT_CHART)
        }
      },
      {
        title: 'Delete PVCs',
        task: async (ctx, _) => {
          const pvcs = await self.k8.listPvcsByNamespace(ctx.config.namespace)

          if (pvcs) {
            for (const pvc of pvcs) {
              await self.k8.deletePvc(pvc, ctx.config.namespace)
            }
          }
        },
        skip: (ctx, _) => !ctx.config.deletePvcs
      },
      {
        title: 'Delete Secrets',
        task: async (ctx, _) => {
          const secrets = await self.k8.listSecretsByNamespace(ctx.config.namespace)

          if (secrets) {
            for (const secret of secrets) {
              await self.k8.deleteSecret(secret, ctx.config.namespace)
            }
          }
        },
        skip: (ctx, _) => !ctx.config.deleteSecrets
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError('Error destroying network', e)
    }

    return true
  }

  /**
   * Run helm upgrade to refresh network components with new settings
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async refresh (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          ctx.config = await self.prepareConfig(task, argv)
        }
      },
      {
        title: `Upgrade chart '${constants.FULLSTACK_DEPLOYMENT_CHART}'`,
        task: async (ctx, _) => {
          const config = ctx.config
          await this.chartManager.upgrade(
            config.namespace,
            constants.FULLSTACK_DEPLOYMENT_CHART,
            config.chartPath,
            config.valuesArg,
            config.fstChartVersion
          )
        }
      },
      {
        title: 'Waiting for network pods to be running',
        task: async (ctx, _) => {
          await this.k8.waitForPods([constants.POD_PHASE_RUNNING], [
            'fullstack.hedera.com/type=network-node'
          ], 1)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError(`Error upgrading chart ${constants.FULLSTACK_DEPLOYMENT_CHART}`, e)
    }

    return true
  }

  /**
   * @param {NetworkCommand} networkCmd
   * @returns {{command: string, desc: string, builder: Function}}
   */
  static getCommandDefinition (networkCmd) {
    if (!networkCmd || !(networkCmd instanceof NetworkCommand)) {
      throw new IllegalArgumentError('An instance of NetworkCommand is required', networkCmd)
    }
    return {
      command: 'network',
      desc: 'Manage solo network deployment',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy solo network',
            builder: y => flags.setCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST),
            handler: argv => {
              networkCmd.logger.debug('==== Running \'network deploy\' ===')
              networkCmd.logger.debug(argv)

              networkCmd.deploy(argv).then(r => {
                networkCmd.logger.debug('==== Finished running `network deploy`====')

                if (!r) process.exit(1)
              }).catch(err => {
                networkCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'destroy',
            desc: 'Destroy solo network',
            builder: y => flags.setCommandFlags(y,
              flags.deletePvcs,
              flags.deleteSecrets,
              flags.force,
              flags.namespace
            ),
            handler: argv => {
              networkCmd.logger.debug('==== Running \'network destroy\' ===')
              networkCmd.logger.debug(argv)

              networkCmd.destroy(argv).then(r => {
                networkCmd.logger.debug('==== Finished running `network destroy`====')

                if (!r) process.exit(1)
              }).catch(err => {
                networkCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'refresh',
            desc: 'Refresh solo network deployment',
            builder: y => flags.setCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST),
            handler: argv => {
              networkCmd.logger.debug('==== Running \'chart upgrade\' ===')
              networkCmd.logger.debug(argv)

              networkCmd.refresh(argv).then(r => {
                networkCmd.logger.debug('==== Finished running `chart upgrade`====')

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
