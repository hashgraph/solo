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

export class RelayCommand extends BaseCommand {
  constructor (opts) {
    super(opts)

    if (!opts || !opts.profileManager) throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader)

    this.profileManager = opts.profileManager
  }

  async prepareValuesArg (valuesFile, nodeIDs, chainID, relayRelease, replicaCount, operatorID, operatorKey) {
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

    nodeIDs.forEach(nodeID => {
      const networkKey = `network-${nodeID.trim()}:50211`
      valuesArg += ` --set config.HEDERA_NETWORK='{"${networkKey}":"0.0.3"}'`
    })

    return valuesArg
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
            flags.chartDirectory,
            flags.namespace,
            flags.valuesFile,
            flags.nodeIDs,
            flags.chainId,
            flags.relayReleaseTag,
            flags.replicaCount,
            flags.operatorId,
            flags.operatorKey,
            flags.profileName,
            flags.profileFile
          ])

          // prompt if inputs are empty and set it in the context
          ctx.config = {
            chartDir: self.configManager.getFlag(flags.chartDirectory),
            namespace: self.configManager.getFlag(flags.namespace),
            valuesFile: self.configManager.getFlag(flags.valuesFile),
            nodeIds: helpers.parseNodeIds(self.configManager.getFlag(flags.nodeIDs)),
            chainId: self.configManager.getFlag(flags.chainId),
            relayRelease: self.configManager.getFlag(flags.relayReleaseTag),
            replicaCount: self.configManager.getFlag(flags.replicaCount),
            operatorId: self.configManager.getFlag(flags.operatorId),
            operatorKey: self.configManager.getFlag(flags.operatorKey)
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
            ctx.config.operatorKey
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

          await self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
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
                flags.namespace,
                flags.valuesFile,
                flags.chartDirectory,
                flags.replicaCount,
                flags.chainId,
                flags.nodeIDs,
                flags.relayReleaseTag,
                flags.operatorId,
                flags.operatorKey,
                flags.profileName,
                flags.profileFile
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
