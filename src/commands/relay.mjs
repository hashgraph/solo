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
import { Listr } from 'listr2'
import { FullstackTestingError, MissingArgumentError } from '../core/errors.mjs'
import * as helpers from '../core/helpers.mjs'
import { constants } from '../core/index.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as prompts from './prompts.mjs'
import { getNodeAccountMap } from '../core/helpers.mjs'

export class RelayCommand extends BaseCommand {
  /**
   * @param {{profileManager: ProfileManager, accountManager: AccountManager, logger: Logger, helm: Helm, k8: K8,
   * chartManager: ChartManager, configManager: ConfigManager, depManager: DependencyManager,
   * downloader: PackageDownloader}} opts
   */
  constructor (opts) {
    super(opts)

    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.profileManager = opts.profileManager
    this.accountManager = opts.accountManager
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
      flags.chainId,
      flags.chartDirectory,
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.operatorId,
      flags.operatorKey,
      flags.profileFile,
      flags.profileName,
      flags.relayReleaseTag,
      flags.replicaCount,
      flags.valuesFile
    ]
  }

  /**
   * @param {string} valuesFile
   * @param {NodeAliases} nodeAliases
   * @param {string} chainID
   * @param {string} relayRelease
   * @param {number} replicaCount
   * @param {string} operatorID
   * @param {string} operatorKey
   * @param {string} namespace
   * @returns {Promise<string>}
   */
  async prepareValuesArg (valuesFile, nodeAliases, chainID, relayRelease, replicaCount, operatorID, operatorKey, namespace) {
    let valuesArg = ''

    const profileName = this.configManager.getFlag(flags.profileName)
    const profileValuesFile = await this.profileManager.prepareValuesForRpcRelayChart(profileName)
    if (profileValuesFile) {
      valuesArg += this.prepareValuesFiles(profileValuesFile)
    }

    valuesArg += ` --set config.MIRROR_NODE_URL=http://${constants.FULLSTACK_DEPLOYMENT_CHART}-rest`
    valuesArg += ` --set config.MIRROR_NODE_URL_WEB3=http://${constants.FULLSTACK_DEPLOYMENT_CHART}-web3`
    valuesArg += ' --set config.MIRROR_NODE_AGENT_CACHEABLE_DNS=false'
    valuesArg += ' --set config.MIRROR_NODE_RETRY_DELAY=2001'
    valuesArg += ' --set config.MIRROR_NODE_GET_CONTRACT_RESULTS_DEFAULT_RETRIES=21'

    if (chainID) {
      valuesArg += ` --set config.CHAIN_ID=${chainID}`
    }

    if (relayRelease) {
      valuesArg += ` --set image.tag=${relayRelease.replace(/^v/, '')}`
    }

    if (replicaCount) {
      valuesArg += ` --set replicaCount=${replicaCount}`
    }

    if (operatorID) {
      valuesArg += ` --set config.OPERATOR_ID_MAIN=${operatorID}`
    }

    if (operatorKey) {
      valuesArg += ` --set config.OPERATOR_KEY_MAIN=${operatorKey}`
    }

    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified')
    }

    const networkJsonString = await this.prepareNetworkJsonString(nodeAliases, namespace)
    valuesArg += ` --set config.HEDERA_NETWORK='${networkJsonString}'`

    if (valuesFile) {
      valuesArg += this.prepareValuesFiles(valuesFile)
    }

    return valuesArg
  }

  /**
   * created a json string to represent the map between the node keys and their ids
   * output example '{"node-1": "0.0.3", "node-2": "0.004"}'
   * @param {NodeAliases} nodeAliases
   * @param {string} namespace
   * @returns {Promise<string>}
   */
  async prepareNetworkJsonString (nodeAliases = [], namespace) {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified')
    }

    const networkIds = {}

    const accountMap = getNodeAccountMap(nodeAliases)

    /** @type {Map<NodeAlias, NetworkNodeServices>} */
    const networkNodeServicesMap = await this.accountManager.getNodeServiceMap(namespace)
    nodeAliases.forEach(nodeAlias => {
      const haProxyClusterIp = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp
      const haProxyGrpcPort = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort
      const networkKey = `${haProxyClusterIp}:${haProxyGrpcPort}`
      networkIds[networkKey] = accountMap.get(nodeAlias)
    })

    return JSON.stringify(networkIds)
  }

  /**
   * @param {NodeAliases} nodeAliases
   * @returns {string}
   */
  prepareReleaseName (nodeAliases = []) {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified')
    }

    let releaseName = 'relay'
    nodeAliases.forEach(nodeAlias => {
      releaseName += `-${nodeAlias}`
    })

    return releaseName
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
          // reset nodeAlias
          self.configManager.setFlag(flags.nodeAliasesUnparsed, '')

          self.configManager.update(argv)

          await prompts.execute(task, self.configManager, RelayCommand.DEPLOY_FLAGS_LIST)

          /**
           * @typedef {Object} RelayDeployConfigClass
           * -- flags --
           * @property {string} chainId
           * @property {string} chartDirectory
           * @property {string} namespace
           * @property {string} nodeAliasesUnparsed
           * @property {string} operatorId
           * @property {string} operatorKey
           * @property {string} profileFile
           * @property {string} profileName
           * @property {string} relayReleaseTag
           * @property {number} replicaCount
           * @property {string} valuesFile
           * -- extra args --
           * @property {string} chartPath
           * @property {boolean} isChartInstalled
           * @property {NodeAliases} nodeAliases
           * @property {string} releaseName
           * @property {string} valuesArg
           * -- methods --
           * @property {getUnusedConfigs} getUnusedConfigs
           */
          /**
           * @callback getUnusedConfigs
           * @returns {string[]}
           */

          // prompt if inputs are empty and set it in the context
          ctx.config = /** @type {RelayDeployConfigClass} **/ this.getConfig(RelayCommand.DEPLOY_CONFIGS_NAME, RelayCommand.DEPLOY_FLAGS_LIST,
            ['nodeAliases'])

          ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed)
          ctx.config.releaseName = self.prepareReleaseName(ctx.config.nodeAliases)
          ctx.config.isChartInstalled = await self.chartManager.isChartInstalled(ctx.config.namespace, ctx.releaseName)

          self.logger.debug('Initialized config', { config: ctx.config })
        }
      },
      {
        title: 'Prepare chart values',
        task: async (ctx, _) => {
          const config = /** @type {RelayDeployConfigClass} **/ ctx.config
          config.chartPath = await self.prepareChartPath(config.chartDirectory, constants.JSON_RPC_RELAY_CHART, constants.JSON_RPC_RELAY_CHART)
          config.valuesArg = await self.prepareValuesArg(
            config.valuesFile,
            config.nodeAliases,
            config.chainId,
            config.relayReleaseTag,
            config.replicaCount,
            config.operatorId,
            config.operatorKey,
            config.namespace
          )
        }
      },
      {
        title: 'Deploy JSON RPC Relay',
        task: async (ctx, _) => {
          const config = /** @type {RelayDeployConfigClass} **/ ctx.config

          await self.chartManager.install(config.namespace, config.releaseName, config.chartPath, '', config.valuesArg)

          await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
            'app=hedera-json-rpc-relay',
            `app.kubernetes.io/instance=${config.releaseName}`
          ], 1, 900, 1000)

          // reset nodeAlias
          self.configManager.setFlag(flags.nodeAliasesUnparsed, '')
          self.configManager.persist()
        }
      },
      {
        title: 'Check relay is ready',
        task: async (ctx, _) => {
          const config = /** @type {RelayDeployConfigClass} **/ ctx.config
          try {
            await self.k8.waitForPodReady([
              'app=hedera-json-rpc-relay',
              `app.kubernetes.io/instance=${config.releaseName}`
            ], 1, 100, 2000)
          } catch (e) {
            throw new FullstackTestingError(`Relay ${config.releaseName} is not ready: ${e.message}`, e)
          }
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError('Error installing relays', e)
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
          // reset nodeAlias
          self.configManager.setFlag(flags.nodeAliasesUnparsed, '')

          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.chartDirectory,
            flags.namespace,
            flags.nodeAliasesUnparsed
          ])

          // prompt if inputs are empty and set it in the context
          ctx.config = {
            chartDirectory: self.configManager.getFlag(flags.chartDirectory),
            namespace: self.configManager.getFlag(flags.namespace),
            nodeAliases: helpers.parseNodeAliases(self.configManager.getFlag(flags.nodeAliasesUnparsed))
          }

          ctx.config.releaseName = this.prepareReleaseName(ctx.config.nodeAliases)
          ctx.config.isChartInstalled = await this.chartManager.isChartInstalled(ctx.config.namespace, ctx.config.releaseName)

          self.logger.debug('Initialized config', { config: ctx.config })
        }
      },
      {
        title: 'Destroy JSON RPC Relay',
        task: async (ctx, _) => {
          const config = ctx.config

          await this.chartManager.uninstall(config.namespace, config.releaseName)

          this.logger.showList('Destroyed Relays', await self.chartManager.getInstalledCharts(config.namespace))

          // reset nodeAliasesUnparsed
          self.configManager.setFlag(flags.nodeAliasesUnparsed, '')
          self.configManager.persist()
        },
        skip: (ctx, _) => !ctx.isChartInstalled
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError('Error uninstalling relays', e)
    }

    return true
  }

  /**
   * @param {RelayCommand} relayCmd
   * @returns {{command: string, desc: string, builder: Function}}
   */
  static getCommandDefinition (relayCmd) {
    if (!relayCmd || !(relayCmd instanceof RelayCommand)) {
      throw new MissingArgumentError('An instance of RelayCommand is required', relayCmd)
    }
    return {
      command: 'relay',
      desc: 'Manage JSON RPC relays in solo network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy a JSON RPC relay',
            builder: y => {
              flags.setCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST)
            },
            handler: argv => {
              relayCmd.logger.debug("==== Running 'relay install' ===", { argv })

              relayCmd.deploy(argv).then(r => {
                relayCmd.logger.debug('==== Finished running `relay install`====')

                if (!r) process.exit(1)
              }).catch(err => {
                relayCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'destroy',
            desc: 'Destroy JSON RPC relay',
            builder: y => flags.setCommandFlags(y,
              flags.chartDirectory,
              flags.namespace,
              flags.nodeAliasesUnparsed
            ),
            handler: argv => {
              relayCmd.logger.debug("==== Running 'relay uninstall' ===", { argv })
              relayCmd.logger.debug(argv)

              relayCmd.destroy(argv).then(r => {
                relayCmd.logger.debug('==== Finished running `relay uninstall`====')

                if (!r) process.exit(1)
              })
            }
          })
          .demandCommand(1, 'Select a relay command')
      }
    }
  }
}
