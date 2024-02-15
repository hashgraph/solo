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
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as paths from 'path'
import { constants } from '../core/index.mjs'
import * as prompts from './prompts.mjs'

export class RelayCommand extends BaseCommand {
  prepareValuesArg (valuesFile, nodeIDs, chainID, relayRelease, replicaCount, operatorID, operatorKey) {
    let valuesArg = ''
    if (valuesFile) {
      const valuesFiles = valuesFile.split(',')
      valuesFiles.forEach(vf => {
        const vfp = paths.resolve(vf)
        valuesArg += ` --values ${vfp}`
      })
    }

    valuesArg += ` --set config.MIRROR_NODE_URL=${constants.FULLSTACK_DEPLOYMENT_CHART}-rest`

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
      const networkKey = `network-${nodeID.trim()}-0-svc:50211`
      valuesArg += ` --set config.HEDERA_NETWORK.${networkKey}=0.0.3`
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

  async install (argv) {
    const self = this
    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // extract config values
          const valuesFile = self.configManager.getFlag(flags.valuesFile)
          const nodeIds = self.configManager.getFlag(flags.nodeIDs)
          const chainId = self.configManager.getFlag(flags.chainId)
          const relayRelease = self.configManager.getFlag(flags.relayReleaseTag)
          const replicaCount = self.configManager.getFlag(flags.replicaCount)
          const operatorId = self.configManager.getFlag(flags.operatorId)
          const operatorKey = self.configManager.getFlag(flags.operatorKey)

          const namespace = self.configManager.getFlag(flags.namespace)
          const chartDir = self.configManager.getFlag(flags.chartDirectory)

          // prompt if inputs are empty and set it in the context
          const namespaces = await self.k8.getNamespaces()
          ctx.config = {
            chartDir: await prompts.promptChartDir(task, chartDir),
            namespace: await prompts.promptSelectNamespaceArg(task, namespace, namespaces),
            valuesFile: await prompts.promptValuesFile(task, valuesFile),
            nodeIds: await prompts.promptNodeIds(task, nodeIds),
            chainId: await prompts.promptChainId(task, chainId),
            relayRelease: await prompts.promptRelayReleaseTag(task, relayRelease),
            replicaCount: await prompts.promptReplicaCount(task, replicaCount),
            operatorId: await prompts.promptOperatorId(task, operatorId),
            operatorKey: await prompts.promptOperatorId(task, operatorKey)
          }

          self.logger.debug('Finished prompts', { ctx })

          ctx.releaseName = this.prepareReleaseName(ctx.config.nodeIds)
          ctx.isChartInstalled = await this.chartManager.isChartInstalled(ctx.config.namespace, ctx.releaseName)

          self.logger.debug('Finished ctx initialization', { ctx })
        }
      },
      {
        title: 'Prepare chart values',
        task: async (ctx, _) => {
          ctx.chartPath = await this.prepareChartPath(ctx.config.chartDir, constants.JSON_RPC_RELAY_CHART, constants.CHART_JSON_RPC_RELAY_NAME)
          ctx.valuesArg = this.prepareValuesArg(
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
        title: 'Install JSON RPC Relay',
        task: async (ctx, _) => {
          const namespace = ctx.config.namespace
          const releaseName = ctx.releaseName
          const chartPath = ctx.chartPath
          const valuesArg = ctx.valuesArg

          await this.chartManager.install(namespace, releaseName, chartPath, '', valuesArg)

          await this.k8.waitForPod(constants.POD_STATUS_RUNNING, [
            'app=hedera-json-rpc-relay',
            `app.kubernetes.io/instance=${releaseName}`
          ], 1, 120, 1000)

          this.logger.showList('Deployed Relays', await self.chartManager.getInstalledCharts(namespace))
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

  async uninstall (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // extract config values
          const nodeIds = self.configManager.getFlag(flags.nodeIDs)
          const namespace = self.configManager.getFlag(flags.namespace)

          // prompt if inputs are empty and set it in the context
          const namespaces = await self.k8.getNamespaces()
          ctx.config = {
            namespace: await prompts.promptSelectNamespaceArg(task, namespace, namespaces),
            nodeIds: await prompts.promptNodeIds(task, nodeIds)
          }

          ctx.config.releaseName = this.prepareReleaseName(ctx.config.nodeIds)
          self.logger.debug('Finished ctx initialization', { ctx })
        }
      },
      {
        title: 'Install JSON RPC Relay',
        task: async (ctx, _) => {
          const namespace = ctx.config.namespace
          const releaseName = ctx.config.releaseName

          await this.chartManager.uninstall(namespace, releaseName)

          this.logger.showList('Deployed Relays', await self.chartManager.getInstalledCharts(namespace))
        }
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
    return {
      command: 'relay',
      desc: 'Manage JSON RPC relays in fullstack testing network',
      builder: yargs => {
        return yargs
          .command({
            command: 'install',
            desc: 'Install a JSON RPC relay',
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
                flags.operatorKey
              )
            },
            handler: argv => {
              relayCmd.logger.debug("==== Running 'relay install' ===", { argv })

              relayCmd.install(argv).then(r => {
                relayCmd.logger.debug('==== Finished running `relay install`====')

                if (!r) process.exit(1)
              }).catch(err => {
                relayCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'uninstall',
            desc: 'Uninstall JSON RPC relay',
            builder: y => flags.setCommandFlags(y,
              flags.namespace,
              flags.nodeIDs
            ),
            handler: argv => {
              relayCmd.logger.debug("==== Running 'relay uninstall' ===", { argv })
              relayCmd.logger.debug(argv)

              relayCmd.uninstall(argv).then(r => {
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
