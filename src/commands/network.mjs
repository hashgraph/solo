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
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from '../core/errors.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import { constants } from '../core/index.mjs'
import * as prompts from './prompts.mjs'
import * as helpers from '../core/helpers.mjs'
import path from 'path'

export class NetworkCommand extends BaseCommand {
  constructor (opts) {
    super(opts)

    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

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
      flags.chainId,
      flags.chartDirectory,
      flags.deployHederaExplorer,
      flags.deployMirrorNode,
      flags.enableHederaExplorerTls,
      flags.enablePrometheusSvcMonitor,
      flags.fstChartVersion,
      flags.hederaExplorerTlsHostName,
      flags.hederaExplorerTlsLoadBalancerIp,
      flags.log4j2Xml,
      flags.namespace,
      flags.nodeIDs,
      flags.profileFile,
      flags.profileName,
      flags.releaseTag,
      flags.settingTxt,
      flags.tlsClusterIssuerType,
      flags.valuesFile
    ]
  }

  getTlsValueArguments (tlsClusterIssuerType, enableHederaExplorerTls, namespace,
    hederaExplorerTlsLoadBalancerIp, hederaExplorerTlsHostName) {
    let valuesArg = ''

    if (enableHederaExplorerTls) {
      if (!['acme-staging', 'acme-prod', 'self-signed'].includes(tlsClusterIssuerType)) {
        throw new Error(`Invalid TLS cluster issuer type: ${tlsClusterIssuerType}, must be one of: "acme-staging", "acme-prod", or "self-signed"`)
      }

      valuesArg += ' --set hedera-explorer.ingress.enabled=true'
      valuesArg += ' --set cloud.haproxyIngressController.enabled=true'
      valuesArg += ` --set global.ingressClassName=${namespace}-hedera-explorer-ingress-class`
      valuesArg += ` --set-json 'hedera-explorer.ingress.hosts[0]={"host":"${hederaExplorerTlsHostName}","paths":[{"path":"/","pathType":"Prefix"}]}'`

      if (hederaExplorerTlsLoadBalancerIp !== '') {
        valuesArg += ` --set haproxy-ingress.controller.service.loadBalancerIP=${hederaExplorerTlsLoadBalancerIp}`
      }

      if (tlsClusterIssuerType === 'self-signed') {
        valuesArg += ' --set cloud.selfSignedClusterIssuer.enabled=true'
      } else {
        valuesArg += ' --set cloud.acmeClusterIssuer.enabled=true'
        valuesArg += ` --set hedera-explorer.certClusterIssuerType=${tlsClusterIssuerType}`
      }
    }

    return valuesArg
  }

  async prepareValuesArg (config = {}) {
    let valuesArg = ''
    if (config.chartDirectory) {
      valuesArg = `-f ${path.join(config.chartDirectory, 'fullstack-deployment', 'values.yaml')}`
    }

    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile)
    }

    const profileName = this.configManager.getFlag(flags.profileName)
    this.profileValuesFile = await this.profileManager.prepareValuesForFstChart(profileName)
    if (this.profileValuesFile) {
      valuesArg += this.prepareValuesFiles(this.profileValuesFile)
    }

    // do not deploy mirror node until after we have the updated address book
    valuesArg += ' --set "hedera-mirror-node.enabled=false" --set "hedera-explorer.enabled=false"'
    valuesArg += ` --set "telemetry.prometheus.svcMonitor.enabled=${config.enablePrometheusSvcMonitor}"`

    if (config.enableHederaExplorerTls) {
      valuesArg += this.getTlsValueArguments(config.tlsClusterIssuerType, config.enableHederaExplorerTls, config.namespace,
        config.hederaExplorerTlsLoadBalancerIp, config.hederaExplorerTlsHostName)
    }

    if (config.releaseTag) {
      const rootImage = helpers.getRootImageRepository(config.releaseTag)
      valuesArg += ` --set "defaults.root.image.repository=${rootImage}"`
    }

    this.logger.debug('Prepared helm chart values', { valuesArg })
    return valuesArg
  }

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
      flags.chainId,
      flags.deployHederaExplorer,
      flags.deployMirrorNode,
      flags.hederaExplorerTlsLoadBalancerIp,
      flags.log4j2Xml,
      flags.profileName,
      flags.profileFile,
      flags.settingTxt
    ])

    await prompts.execute(task, this.configManager, NetworkCommand.DEPLOY_FLAGS_LIST)

    /**
     * @typedef {Object} NetworkDeployConfigClass
     * -- flags --
     * @property {string} applicationEnv
     * @property {string} chartDirectory
     * @property {boolean} deployHederaExplorer
     * @property {boolean} deployMirrorNode
     * @property {boolean} enableHederaExplorerTls
     * @property {boolean} enablePrometheusSvcMonitor
     * @property {string} fstChartVersion
     * @property {string} hederaExplorerTlsHostName
     * @property {string} hederaExplorerTlsLoadBalancerIp
     * @property {string} namespace
     * @property {string} nodeIDs
     * @property {string} profileFile
     * @property {string} profileName
     * @property {string} releaseTag
     * @property {string} tlsClusterIssuerType
     * -- extra args --
     * @property {string[]} nodeIds
     * @property {string} chartPath
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
      ['nodeIds', 'chartPath', 'valuesArg'])

    config.nodeIds = helpers.parseNodeIds(config.nodeIDs)

    // compute values
    config.chartPath = await this.prepareChartPath(config.chartDirectory,
      constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

    config.valuesArg = await this.prepareValuesArg(config)

    this.logger.debug('Prepared config', {
      config,
      cachedConfig: this.configManager.config
    })
    return config
  }

  /**
   * Run helm install and deploy network components
   * @param argv
   * @return {Promise<boolean>}
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
                task: () =>
                  self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
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
                task: () =>
                  self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
                    'fullstack.hedera.com/type=haproxy'
                  ], 1, 60 * 15, 1000) // timeout 15 minutes
              })
            }

            // Envoy Proxy
            for (const nodeId of config.nodeIds) {
              subTasks.push({
                title: `Check Envoy Proxy for: ${chalk.yellow(nodeId)}`,
                task: () =>
                  self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
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
              task: () =>
                self.k8.waitForPodReady([
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
   * @param argv
   * @return {Promise<boolean>}
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
   * @param argv
   * @return {Promise<boolean>}
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

  static getCommandDefinition (networkCmd) {
    if (!networkCmd || !(networkCmd instanceof NetworkCommand)) {
      throw new IllegalArgumentError('An instance of NetworkCommand is required', networkCmd)
    }
    return {
      command: 'network',
      desc: 'Manage fullstack testing network deployment',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy fullstack testing network',
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
            desc: 'Destroy fullstack testing network',
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
            desc: 'Refresh fullstack testing network deployment',
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
