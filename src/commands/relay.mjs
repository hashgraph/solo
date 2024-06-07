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
import { FullstackTestingError, MissingArgumentError } from '../core/errors.mjs'
import * as helpers from '../core/helpers.mjs'
import { constants } from '../core/index.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as prompts from './prompts.mjs'
import { getNodeAccountMap } from '../core/constants.mjs'

export class RelayCommand extends BaseCommand {
  constructor (opts) {
    super(opts)

    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.profileManager = opts.profileManager
    this.accountManager = opts.accountManager
  }

  async prepareValuesArg (valuesFile, nodeIDs, chainID, relayRelease, replicaCount, operatorID, operatorKey, namespace) {
    let valuesArg = ''
    if (valuesFile) {
      valuesArg += this.prepareValuesFiles(valuesFile)
    }

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

    if (!nodeIDs) {
      throw new MissingArgumentError('Node IDs must be specified')
    }

    const networkJsonString = await this.prepareNetworkJsonString(nodeIDs, namespace)
    valuesArg += ` --set config.HEDERA_NETWORK='${networkJsonString}'`
    return valuesArg
  }

  // created a json string to represent the map between the node keys and their ids
  // output example '{"node-1": "0.0.3", "node-2": "0.004"}'
  async prepareNetworkJsonString (nodeIDs = [], namespace) {
    if (!nodeIDs) {
      throw new MissingArgumentError('Node IDs must be specified')
    }

    const networkIds = {}
    const accountMap = getNodeAccountMap(nodeIDs)

    const networkNodeServicesMap = await this.accountManager.getNodeServiceMap(namespace)
    nodeIDs.forEach(nodeID => {
      const nodeName = networkNodeServicesMap.get(nodeID).nodeName
      const haProxyGrpcPort = networkNodeServicesMap.get(nodeID).haProxyGrpcPort
      const networkKey = `network-${nodeName}:${haProxyGrpcPort}`
      networkIds[networkKey] = accountMap.get(nodeID)
    })

    return JSON.stringify(networkIds)
  }

  prepareReleaseName (nodeIDs = []) {
    if (!nodeIDs) {
      throw new MissingArgumentError('Node IDs must be specified')
    }

    let releaseName = 'relay'
    nodeIDs.forEach(nodeID => {
      releaseName += `-${nodeID}`
    })

    return releaseName
  }

  async deploy (argv) {
    const self = this
    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          // reset nodeID
          self.configManager.setFlag(flags.nodeIDs, '')

          self.configManager.update(argv)

          await prompts.execute(task, self.configManager, [
            flags.chainId,
            flags.chartDirectory,
            flags.namespace,
            flags.nodeIDs,
            flags.operatorId,
            flags.operatorKey,
            flags.profileFile,
            flags.profileName,
            flags.relayReleaseTag,
            flags.replicaCount,
            flags.valuesFile
          ])

          // prompt if inputs are empty and set it in the context
          ctx.config = {
            chainId: self.configManager.getFlag(flags.chainId),
            chartDir: self.configManager.getFlag(flags.chartDirectory),
            namespace: self.configManager.getFlag(flags.namespace),
            nodeIds: helpers.parseNodeIds(self.configManager.getFlag(flags.nodeIDs)),
            operatorId: self.configManager.getFlag(flags.operatorId),
            operatorKey: self.configManager.getFlag(flags.operatorKey),
            relayRelease: self.configManager.getFlag(flags.relayReleaseTag),
            replicaCount: self.configManager.getFlag(flags.replicaCount),
            valuesFile: self.configManager.getFlag(flags.valuesFile)
          }

          ctx.releaseName = self.prepareReleaseName(ctx.config.nodeIds)
          ctx.isChartInstalled = await self.chartManager.isChartInstalled(ctx.config.namespace, ctx.releaseName)

          self.logger.debug('Initialized config', { config: ctx.config })
        }
      },
      {
        title: 'Prepare chart values',
        task: async (ctx, _) => {
          ctx.chartPath = await self.prepareChartPath(ctx.config.chartDir, constants.JSON_RPC_RELAY_CHART, constants.JSON_RPC_RELAY_CHART)
          ctx.valuesArg = await self.prepareValuesArg(
            ctx.config.valuesFile,
            ctx.config.nodeIds,
            ctx.config.chainId,
            ctx.config.relayRelease,
            ctx.config.replicaCount,
            ctx.config.operatorId,
            ctx.config.operatorKey,
            ctx.config.namespace
          )
        }
      },
      {
        title: 'Deploy JSON RPC Relay',
        task: async (ctx, _) => {
          const namespace = ctx.config.namespace
          const releaseName = ctx.releaseName
          const chartPath = ctx.chartPath
          const valuesArg = ctx.valuesArg

          await self.chartManager.install(namespace, releaseName, chartPath, '', valuesArg)

          await self.k8.waitForPods([constants.POD_PHASE_RUNNING], [
            'app=hedera-json-rpc-relay',
            `app.kubernetes.io/instance=${releaseName}`
          ], 1, 900, 1000)

          // reset nodeID
          self.configManager.setFlag(flags.nodeIDs, '')
          self.configManager.persist()
        }
      },
      {
        title: 'Check relay is ready',
        task: async (ctx, _) => {
          const releaseName = ctx.releaseName
          try {
            await self.k8.waitForPodReady([
              'app=hedera-json-rpc-relay',
              `app.kubernetes.io/instance=${releaseName}`
            ], 1, 100, 2000)
          } catch (e) {
            throw new FullstackTestingError(`Relay ${releaseName} is not ready: ${e.message}`, e)
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

  async destroy (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          // reset nodeID
          self.configManager.setFlag(flags.nodeIDs, '')

          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.chartDirectory,
            flags.namespace,
            flags.nodeIDs
          ])

          // prompt if inputs are empty and set it in the context
          ctx.config = {
            chartDir: self.configManager.getFlag(flags.chartDirectory),
            namespace: self.configManager.getFlag(flags.namespace),
            nodeIds: helpers.parseNodeIds(self.configManager.getFlag(flags.nodeIDs))
          }

          ctx.releaseName = this.prepareReleaseName(ctx.config.nodeIds)
          ctx.isChartInstalled = await this.chartManager.isChartInstalled(ctx.config.namespace, ctx.releaseName)

          self.logger.debug('Initialized config', { config: ctx.config })
        }
      },
      {
        title: 'Destroy JSON RPC Relay',
        task: async (ctx, _) => {
          const namespace = ctx.config.namespace
          const releaseName = ctx.releaseName

          await this.chartManager.uninstall(namespace, releaseName)

          this.logger.showList('Destroyed Relays', await self.chartManager.getInstalledCharts(namespace))

          // reset nodeID
          self.configManager.setFlag(flags.nodeIDs, '')
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

  static getCommandDefinition (relayCmd) {
    if (!relayCmd || !(relayCmd instanceof RelayCommand)) {
      throw new MissingArgumentError('An instance of RelayCommand is required', relayCmd)
    }
    return {
      command: 'relay',
      desc: 'Manage JSON RPC relays in fullstack testing network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy a JSON RPC relay',
            builder: y => {
              flags.setCommandFlags(y,
                flags.chainId,
                flags.chartDirectory,
                flags.namespace,
                flags.nodeIDs,
                flags.operatorId,
                flags.operatorKey,
                flags.profileFile,
                flags.profileName,
                flags.relayReleaseTag,
                flags.replicaCount,
                flags.valuesFile
              )
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
              flags.namespace,
              flags.nodeIDs
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
