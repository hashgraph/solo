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
import { SoloError, MissingArgumentError } from '../core/errors.ts'
import * as helpers from '../core/helpers.ts'
import type { ProfileManager, AccountManager } from '../core/index.ts'
import { constants } from '../core/index.ts'
import { BaseCommand } from './base.ts'
import * as flags from './flags.ts'
import * as prompts from './prompts.ts'
import { getNodeAccountMap } from '../core/helpers.ts'
import { type NodeAliases } from '../types/aliases.ts'
import { type Opts } from '../types/index.ts'

export class RelayCommand extends BaseCommand {
  private readonly profileManager: ProfileManager
  private readonly accountManager: AccountManager

  constructor (opts: Opts) {
    super(opts)

    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.profileManager = opts.profileManager
    this.accountManager = opts.accountManager
  }

  static get DEPLOY_CONFIGS_NAME () {
    return 'deployConfigs'
  }

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
      flags.quiet,
      flags.relayReleaseTag,
      flags.replicaCount,
      flags.valuesFile
    ]
  }

  static get DESTROY_FLAGS_LIST () {
    return [
      flags.chartDirectory,
      flags.namespace,
      flags.nodeAliasesUnparsed
    ]
  }

  async prepareValuesArg (valuesFile: string, nodeAliases: NodeAliases, chainID: string, relayRelease: string,
    replicaCount: number, operatorID: string, operatorKey: string, namespace: string) {
    let valuesArg = ''

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string
    const profileValuesFile = await this.profileManager.prepareValuesForRpcRelayChart(profileName)
    if (profileValuesFile) {
      valuesArg += this.prepareValuesFiles(profileValuesFile)
    }

    valuesArg += ` --set config.MIRROR_NODE_URL=http://${constants.SOLO_DEPLOYMENT_CHART}-rest`
    valuesArg += ` --set config.MIRROR_NODE_URL_WEB3=http://${constants.SOLO_DEPLOYMENT_CHART}-web3`
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
   */
  async prepareNetworkJsonString (nodeAliases: NodeAliases = [], namespace: string) {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified')
    }

    const networkIds = {}

    const accountMap = getNodeAccountMap(nodeAliases)

    const networkNodeServicesMap = await this.accountManager.getNodeServiceMap(namespace)
    nodeAliases.forEach(nodeAlias => {
      const haProxyClusterIp = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp
      const haProxyGrpcPort = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort
      const networkKey = `${haProxyClusterIp}:${haProxyGrpcPort}`
      networkIds[networkKey] = accountMap.get(nodeAlias)
    })

    return JSON.stringify(networkIds)
  }

  prepareReleaseName (nodeAliases: NodeAliases = []) {
    if (!nodeAliases) {
      throw new MissingArgumentError('Node IDs must be specified')
    }

    let releaseName = 'relay'
    nodeAliases.forEach(nodeAlias => {
      releaseName += `-${nodeAlias}`
    })

    return releaseName
  }

  async deploy (argv: any) {
    const self = this
    const lease = self.leaseManager.instantiateLease()

    interface RelayDeployConfigClass {
      chainId: string
      chartDirectory: string
      namespace: string
      nodeAliasesUnparsed: string
      operatorId: string
      operatorKey: string
      profileFile: string
      profileName: string
      relayReleaseTag: string
      replicaCount: number
      valuesFile: string
      chartPath: string
      isChartInstalled: boolean
      nodeAliases: NodeAliases
      releaseName: string
      valuesArg: string
      getUnusedConfigs: () => string[]
    }

    interface Context {
      config: RelayDeployConfigClass
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          // reset nodeAlias
          self.configManager.setFlag(flags.nodeAliasesUnparsed, '')

          self.configManager.update(argv)

          await prompts.execute(task, self.configManager, RelayCommand.DEPLOY_FLAGS_LIST)

          // prompt if inputs are empty and set it in the context
          ctx.config = this.getConfig(RelayCommand.DEPLOY_CONFIGS_NAME, RelayCommand.DEPLOY_FLAGS_LIST,
            ['nodeAliases']) as RelayDeployConfigClass

          ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed)
          ctx.config.releaseName = self.prepareReleaseName(ctx.config.nodeAliases)
          ctx.config.isChartInstalled = await self.chartManager.isChartInstalled(ctx.config.namespace, ctx.config.releaseName)

          self.logger.debug('Initialized config', { config: ctx.config })

          return lease.buildAcquireTask(task)
        }
      },
      {
        title: 'Prepare chart values',
        task: async (ctx) => {
          const config = ctx.config
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
        task: async (ctx) => {
          const config = ctx.config

          await self.chartManager.install(config.namespace, config.releaseName, config.chartPath, '', config.valuesArg)

          await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
            'app=hedera-json-rpc-relay',
            `app.kubernetes.io/instance=${config.releaseName}`
          ], 1, 900, 1000)

          // reset nodeAlias
          self.configManager.setFlag(flags.nodeAliasesUnparsed, '')
        }
      },
      {
        title: 'Check relay is ready',
        task: async (ctx) => {
          const config = ctx.config
          try {
            await self.k8.waitForPodReady([
              'app=hedera-json-rpc-relay',
              `app.kubernetes.io/instance=${config.releaseName}`
            ], 1, 100, 2000)
          } catch (e: Error | any) {
            throw new SoloError(`Relay ${config.releaseName} is not ready: ${e.message}`, e)
          }
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError('Error installing relays', e)
    } finally {
      await lease.release()
    }

    return true
  }

  async destroy (argv: any) {
    const self = this
    const lease = self.leaseManager.instantiateLease()

    interface RelayDestroyConfigClass {
      chartDirectory: string
      namespace: string
      nodeAliases: NodeAliases
      releaseName: string
      isChartInstalled: boolean
    }

    interface Context {
      config: RelayDestroyConfigClass
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          // reset nodeAlias
          self.configManager.setFlag(flags.nodeAliasesUnparsed, '')

          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, RelayCommand.DESTROY_FLAGS_LIST)

          // prompt if inputs are empty and set it in the context
          ctx.config = {
            chartDirectory: self.configManager.getFlag<string>(flags.chartDirectory) as string,
            namespace: self.configManager.getFlag<string>(flags.namespace) as string,
            nodeAliases: helpers.parseNodeAliases((self.configManager.getFlag<string>(flags.nodeAliasesUnparsed) as string))
          } as RelayDestroyConfigClass

          ctx.config.releaseName = this.prepareReleaseName(ctx.config.nodeAliases)
          ctx.config.isChartInstalled = await this.chartManager.isChartInstalled(ctx.config.namespace, ctx.config.releaseName)

          self.logger.debug('Initialized config', { config: ctx.config })

          return lease.buildAcquireTask(task)
        }
      },
      {
        title: 'Destroy JSON RPC Relay',
        task: async (ctx) => {
          const config = ctx.config

          await this.chartManager.uninstall(config.namespace, config.releaseName)

          this.logger.showList('Destroyed Relays', await self.chartManager.getInstalledCharts(config.namespace))

          // reset nodeAliasesUnparsed
          self.configManager.setFlag(flags.nodeAliasesUnparsed, '')
        },
        skip: (ctx) => !ctx.config.isChartInstalled
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError('Error uninstalling relays', e)
    } finally {
      await lease.release()
    }

    return true
  }

  getCommandDefinition (): { command: string; desc: string; builder: Function } {
    const relayCmd = this
    return {
      command: 'relay',
      desc: 'Manage JSON RPC relays in solo network',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy a JSON RPC relay',
            builder: (y: any) => {
              flags.setCommandFlags(y, ...RelayCommand.DEPLOY_FLAGS_LIST)
            },
            handler: (argv: any) => {
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
            builder: (y: any) => flags.setCommandFlags(y,
              flags.chartDirectory,
              flags.namespace,
              flags.nodeAliasesUnparsed
            ),
            handler: (argv: any) => {
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
