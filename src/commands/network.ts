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
import chalk from 'chalk'
import { Listr } from 'listr2'
import { SoloError, IllegalArgumentError, MissingArgumentError } from '../core/errors.ts'
import { BaseCommand } from './base.ts'
import * as flags from './flags.ts'
import type { KeyManager, PlatformInstaller, ProfileManager } from '../core/index.ts'
import { constants, Templates } from '../core/index.ts'
import * as prompts from './prompts.ts'
import * as helpers from '../core/helpers.ts'
import path from 'path'
import { addDebugOptions, validatePath } from '../core/helpers.ts'
import fs from 'fs'
import { USER_ROLE } from '../core/constants.mjs'
import { type NodeAlias, type NodeAliases } from '../types/aliases.ts'
import { type Opts } from '../types/index.js'

export type NetworkDeployConfigClass = {
  applicationEnv: string
  cacheDir: string
  chartDirectory: string
  enablePrometheusSvcMonitor: boolean
  soloChartVersion: string
  namespace: string
  nodeAliasesUnparsed: string
  persistentVolumeClaims: string
  profileFile: string
  profileName: string
  releaseTag: string
  chartPath: string
  keysDir: string
  nodeAliases: NodeAliases
  stagingDir: string
  stagingKeysDir: string
  valuesArg: string
  getUnusedConfigs: () => string[]
}

export class NetworkCommand extends BaseCommand {
  private readonly keyManager: KeyManager
  private readonly platformInstaller: PlatformInstaller
  private readonly profileManager: ProfileManager
  private profileValuesFile?: string

  constructor (opts: Opts) {
    super(opts)

    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required')
    if (!opts || !opts.keyManager) throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager)
    if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)
    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.keyManager = opts.keyManager
    this.platformInstaller = opts.platformInstaller
    this.profileManager = opts.profileManager
  }

  static get DEPLOY_CONFIGS_NAME () {
    return 'deployConfigs'
  }

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
      flags.soloChartVersion,
      flags.debugNodeAlias,
      flags.log4j2Xml,
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.persistentVolumeClaims,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.releaseTag,
      flags.settingTxt,
      flags.valuesFile
    ]
  }

  async prepareValuesArg (config: {chartDirectory?: string; app?: string; nodeAliases?: string[]; debugNodeAlias?: NodeAlias;
    enablePrometheusSvcMonitor?: boolean; releaseTag?: string; persistentVolumeClaims?: string;
    valuesFile?: string; } = {}) {
    let valuesArg = config.chartDirectory ? `-f ${path.join(config.chartDirectory, 'solo-deployment', 'values.yaml')}` : ''

    if (config.app !== constants.HEDERA_APP_NAME) {
      const index = config.nodeAliases.length
      for (let i = 0; i < index; i++) {
        valuesArg += ` --set "hedera.nodes[${i}].root.extraEnv[0].name=JAVA_MAIN_CLASS"`
        valuesArg += ` --set "hedera.nodes[${i}].root.extraEnv[0].value=com.swirlds.platform.Browser"`
      }
      valuesArg = addDebugOptions(valuesArg, config.debugNodeAlias, 1)
    } else {
      valuesArg = addDebugOptions(valuesArg, config.debugNodeAlias)
    }

    const profileName = <string>this.configManager.getFlag<string>(flags.profileName)
    this.profileValuesFile = await this.profileManager.prepareValuesForSoloChart(profileName)
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

  async prepareConfig (task: any, argv: any) {
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
      flags.debugNodeAlias,
      flags.log4j2Xml,
      flags.persistentVolumeClaims,
      flags.profileName,
      flags.profileFile,
      flags.settingTxt
    ])

    await prompts.execute(task, this.configManager, NetworkCommand.DEPLOY_FLAGS_LIST)

    // create a config object for subsequent steps
    const config = this.getConfig(NetworkCommand.DEPLOY_CONFIGS_NAME, NetworkCommand.DEPLOY_FLAGS_LIST,
      [
        'chartPath',
        'keysDir',
        'nodeAliases',
        'stagingDir',
        'stagingKeysDir',
        'valuesArg'
      ]) as NetworkDeployConfigClass

    config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed)

    // compute values
    config.chartPath = await this.prepareChartPath(config.chartDirectory,
      constants.SOLO_TESTING_CHART, constants.SOLO_DEPLOYMENT_CHART)

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

    if (!await this.k8.getClusterRole(USER_ROLE)) {
      await this.k8.createClusterRole(USER_ROLE)
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

  /** Run helm install and deploy network components */
  async deploy (argv: any) {
    const self = this

    interface Context {
      config: NetworkDeployConfigClass
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          ctx.config = await self.prepareConfig(task, argv)
        }
      },
      {
        title: 'Prepare staging directory',
        task: (_, parentTask) => {
          return parentTask.newListr([
            {
              title: 'Copy Gossip keys to staging',
              task: (ctx) => {
                const config = ctx.config

                this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, config.nodeAliases)
              }
            },
            {
              title: 'Copy gRPC TLS keys to staging',
              task: (ctx) => {
                const config = ctx.config
                for (const nodeAlias of config.nodeAliases) {
                  const tlsKeyFiles = self.keyManager.prepareTLSKeyFilePaths(nodeAlias, config.keysDir)
                  self.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir)
                }
              }
            }
          ], {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Copy node keys to secrets',
        task: (ctx, parentTask) => {
          const config = ctx.config

          // set up the sub-tasks
          return parentTask.newListr(self.platformInstaller.copyNodeKeys(config.stagingDir, config.nodeAliases), {
            concurrent: true,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: `Install chart '${constants.SOLO_DEPLOYMENT_CHART}'`,
        task: async (ctx) => {
          const config = ctx.config
          if (await self.chartManager.isChartInstalled(config.namespace, constants.SOLO_DEPLOYMENT_CHART)) {
            await self.chartManager.uninstall(config.namespace, constants.SOLO_DEPLOYMENT_CHART)
          }

          await this.chartManager.install(
            config.namespace,
            constants.SOLO_DEPLOYMENT_CHART,
            config.chartPath,
            config.soloChartVersion,
            config.valuesArg)
        }
      },
      {
        title: 'Check node pods are running',
        task:
           (ctx, task) => {
             const subTasks: any[] = []
             const config = ctx.config

             // nodes
             for (const nodeAlias of config.nodeAliases) {
               subTasks.push({
                 title: `Check Node: ${chalk.yellow(nodeAlias)}`,
                 task: async () =>
                   await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
                     'solo.hedera.com/type=network-node',
                    `solo.hedera.com/node-name=${nodeAlias}`
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
           (ctx, task) => {
             const subTasks: any[] = []
             const config = ctx.config

             // HAProxy
             for (const nodeAlias of config.nodeAliases) {
               subTasks.push({
                 title: `Check HAProxy for: ${chalk.yellow(nodeAlias)}`,
                 task: async () =>
                   await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
                     'solo.hedera.com/type=haproxy'
                   ], 1, 60 * 15, 1000) // timeout 15 minutes
               })
             }

             // Envoy Proxy
             for (const nodeAlias of config.nodeAliases) {
               subTasks.push({
                 title: `Check Envoy Proxy for: ${chalk.yellow(nodeAlias)}`,
                 task: async () =>
                   await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
                     'solo.hedera.com/type=envoy-proxy'
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
           (_, task) => {
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
    } catch (e: Error | any) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, e)
    }

    return true
  }

  async destroy (argv: any) {
    const self = this

    interface Context {
      config: {
        deletePvcs: boolean
        deleteSecrets: boolean
        namespace: string
      }
    }

    const tasks = new Listr<Context>([
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
            deletePvcs: <boolean>self.configManager.getFlag<boolean>(flags.deletePvcs),
            deleteSecrets: <boolean>self.configManager.getFlag<boolean>(flags.deleteSecrets),
            namespace: <string>self.configManager.getFlag<string>(flags.namespace)
          }
        }
      },
      {
        title: `Uninstall chart ${constants.SOLO_DEPLOYMENT_CHART}`,
        task: async (ctx) => {
          await self.chartManager.uninstall(ctx.config.namespace, constants.SOLO_DEPLOYMENT_CHART)
        }
      },
      {
        title: 'Delete PVCs',
        task: async (ctx) => {
          const pvcs = await self.k8.listPvcsByNamespace(ctx.config.namespace)

          if (pvcs) {
            for (const pvc of pvcs) {
              await self.k8.deletePvc(pvc, ctx.config.namespace)
            }
          }
        },
        skip: (ctx) => !ctx.config.deletePvcs
      },
      {
        title: 'Delete Secrets',
        task: async (ctx) => {
          const secrets = await self.k8.listSecretsByNamespace(ctx.config.namespace)

          if (secrets) {
            for (const secret of secrets) {
              await self.k8.deleteSecret(secret, ctx.config.namespace)
            }
          }
        },
        skip: (ctx) => !ctx.config.deleteSecrets
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError('Error destroying network', e)
    }

    return true
  }

  /** Run helm upgrade to refresh network components with new settings */
  async refresh (argv: any) {
    const self = this

    interface Context {
      config: NetworkDeployConfigClass
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          ctx.config = await self.prepareConfig(task, argv)
        }
      },
      {
        title: `Upgrade chart '${constants.SOLO_DEPLOYMENT_CHART}'`,
        task: async (ctx) => {
          const config = ctx.config
          await this.chartManager.upgrade(
            config.namespace,
            constants.SOLO_DEPLOYMENT_CHART,
            config.chartPath,
            config.valuesArg,
            config.soloChartVersion
          )
        }
      },
      {
        title: 'Waiting for network pods to be running',
        task: async () => {
          await this.k8.waitForPods([constants.POD_PHASE_RUNNING], [
            'solo.hedera.com/type=network-node'
          ], 1)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error upgrading chart ${constants.SOLO_DEPLOYMENT_CHART}`, e)
    }

    return true
  }

  getCommandDefinition (): { command: string; desc: string; builder: Function } {
    const networkCmd = this
    return {
      command: 'network',
      desc: 'Manage solo network deployment',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy solo network',
            builder: (y: any) => flags.setCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST),
            handler: (argv: any) => {
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
            builder: (y: any) => flags.setCommandFlags(y,
              flags.deletePvcs,
              flags.deleteSecrets,
              flags.force,
              flags.namespace
            ),
            handler: (argv: any) => {
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
            builder: (y: any) => flags.setCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST),
            handler: (argv: any) => {
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
