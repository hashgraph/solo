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
import { FullstackTestingError } from '../core/errors.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as paths from 'path'
import { constants, Templates } from '../core/index.mjs'
import * as prompts from './prompts.mjs'
import * as helpers from '../core/helpers.mjs'

export class NetworkCommand extends BaseCommand {
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

  prepareValuesFiles (valuesFile) {
    let valuesArg = ''
    if (valuesFile) {
      const valuesFiles = valuesFile.split(',')
      valuesFiles.forEach(vf => {
        const vfp = paths.resolve(vf)
        valuesArg += ` --values ${vfp}`
      })
    }

    return valuesArg
  }

  prepareValuesArg (config = {}) {
    let valuesArg = ''
    if (config.chartDir) {
      valuesArg = `-f ${config.chartDir}/fullstack-deployment/values.yaml`
    }

    valuesArg += this.prepareValuesFiles(config.valuesFile)

    valuesArg += ` --set hedera-mirror-node.enabled=${config.deployMirrorNode} --set hedera-explorer.enabled=${config.deployHederaExplorer}`
    valuesArg += ` --set telemetry.prometheus.svcMonitor.enabled=${config.enablePrometheusSvcMonitor}`

    if (config.enableHederaExplorerTls) {
      valuesArg += this.getTlsValueArguments(config.tlsClusterIssuerType, config.enableHederaExplorerTls, config.namespace,
        config.hederaExplorerTlsLoadBalancerIp, config.hederaExplorerTlsHostName)
    }

    if (config.releaseTag) {
      const rootImage = helpers.getRootImageRepository(config.releaseTag)
      valuesArg += ` --set defaults.root.image.repository=${rootImage}`
    }

    // prepare name and account IDs for nodes
    const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
    const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard
    let accountId = constants.HEDERA_NODE_ACCOUNT_ID_START.num
    let i = 0
    config.nodeIds.forEach(nodeId => {
      valuesArg += ` --set hedera.nodes[${i}].name=${nodeId},hedera.nodes[${i++}].accountId=${realm}.${shard}.${accountId++}`
    })

    this.logger.debug('Prepared helm chart values', { valuesArg })
    return valuesArg
  }

  async prepareConfig (task, argv) {
    const flagList = [
      flags.releaseTag, // we need it to determine which version of root image(Java17 or Java21) we should use
      flags.namespace,
      flags.nodeIDs,
      flags.chartDirectory,
      flags.fstChartVersion,
      flags.valuesFile,
      flags.deployMirrorNode,
      flags.deployHederaExplorer,
      flags.tlsClusterIssuerType,
      flags.enableHederaExplorerTls,
      flags.hederaExplorerTlsHostName,
      flags.enablePrometheusSvcMonitor
    ]

    this.configManager.update(argv)
    this.logger.debug('Loaded cached config', { config: this.configManager.config })
    await prompts.execute(task, this.configManager, flagList)

    // create a config object for subsequent steps
    const config = {
      releaseTag: this.configManager.getFlag(flags.releaseTag),
      namespace: this.configManager.getFlag(flags.namespace),
      nodeIds: helpers.parseNodeIDs(this.configManager.getFlag(flags.nodeIDs)),
      chartDir: this.configManager.getFlag(flags.chartDirectory),
      fstChartVersion: this.configManager.getFlag(flags.fstChartVersion),
      valuesFile: this.configManager.getFlag(flags.valuesFile),
      deployMirrorNode: this.configManager.getFlag(flags.deployMirrorNode),
      deployHederaExplorer: this.configManager.getFlag(flags.deployHederaExplorer),
      tlsClusterIssuerType: this.configManager.getFlag(flags.tlsClusterIssuerType),
      enableHederaExplorerTls: this.configManager.getFlag(flags.enableHederaExplorerTls),
      hederaExplorerTlsHostName: this.configManager.getFlag(flags.hederaExplorerTlsHostName),
      enablePrometheusSvcMonitor: this.configManager.getFlag(flags.enablePrometheusSvcMonitor)
    }

    // compute values
    config.hederaExplorerTlsLoadBalancerIp = argv.hederaExplorerTlsLoadBalancerIp
    config.chartPath = await this.prepareChartPath(config.chartDir,
      constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

    config.valuesArg = this.prepareValuesArg(config)

    this.logger.debug('Prepared config', { config, cachedConfig: this.configManager.config })
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
          ctx.config = await self.prepareConfig(task, argv)
        }
      },
      {
        title: `Install chart '${constants.FULLSTACK_DEPLOYMENT_CHART}'`,
        task: async (ctx, _) => {
          if (await self.chartManager.isChartInstalled(ctx.config.namespace, constants.FULLSTACK_DEPLOYMENT_CHART)) {
            await self.chartManager.uninstall(ctx.config.namespace, constants.FULLSTACK_DEPLOYMENT_CHART)
          }

          await this.chartManager.install(
            ctx.config.namespace,
            constants.FULLSTACK_DEPLOYMENT_CHART,
            ctx.config.chartPath,
            ctx.config.fstChartVersion,
            ctx.config.valuesArg)
        }
      },
      {
        title: 'Waiting for network pods to be ready',
        task:
          async (ctx, task) => {
            const subTasks = []
            for (const nodeId of ctx.config.nodeIds) {
              const podName = Templates.renderNetworkPodName(nodeId)
              subTasks.push({
                title: `Node: ${chalk.yellow(nodeId)} (Pod: ${podName})`,
                task: () =>
                  self.k8.waitForPod(constants.POD_STATUS_RUNNING, [
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
            flags.namespace,
            flags.deletePvcs
          ])

          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            deletePvcs: self.configManager.getFlag(flags.deletePvcs)
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
        title: 'Get PVCs for namespace',
        task: async (ctx, _) => {
          if (ctx.config.deletePvcs === true) {
            ctx.config.pvcs = await self.k8.listPvcsByNamespace(ctx.config.namespace)
          }
        }
      },
      {
        title: 'Delete PVCs for namespace',
        task: async (ctx, _) => {
          if (ctx.config.pvcs) {
            for (const pvc of ctx.config.pvcs) {
              await self.k8.deletePvc(pvc, ctx.config.namespace)
            }
          }
        },
        skip: (ctx, _) => !ctx.config.pvcs
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError('Error starting node', e)
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
          await this.chartManager.upgrade(
            ctx.config.namespace,
            constants.FULLSTACK_DEPLOYMENT_CHART,
            ctx.config.chartPath,
            ctx.config.valuesArg
          )
        }
      },
      {
        title: 'Waiting for network pods to be ready',
        task: async (ctx, _) => {
          await this.k8.waitForPod(constants.POD_STATUS_RUNNING, [
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
    return {
      command: 'network',
      desc: 'Manage fullstack testing network deployment',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy fullstack testing network',
            builder: y => flags.setCommandFlags(y,
              flags.releaseTag,
              flags.namespace,
              flags.nodeIDs,
              flags.chartDirectory,
              flags.valuesFile,
              flags.deployMirrorNode,
              flags.deployHederaExplorer,
              flags.tlsClusterIssuerType,
              flags.enableHederaExplorerTls,
              flags.hederaExplorerTlsLoadBalancerIp,
              flags.hederaExplorerTlsHostName,
              flags.enablePrometheusSvcMonitor,
              flags.fstChartVersion
            ),
            handler: argv => {
              networkCmd.logger.debug("==== Running 'network deploy' ===")
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
              flags.namespace,
              flags.force,
              flags.deletePvcs
            ),
            handler: argv => {
              networkCmd.logger.debug("==== Running 'network destroy' ===")
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
            builder: y => flags.setCommandFlags(y,
              flags.namespace,
              flags.chartDirectory,
              flags.valuesFile,
              flags.deployMirrorNode,
              flags.deployHederaExplorer,
              flags.tlsClusterIssuerType,
              flags.enableHederaExplorerTls,
              flags.hederaExplorerTlsLoadBalancerIp,
              flags.hederaExplorerTlsHostName,
              flags.enablePrometheusSvcMonitor
            ),
            handler: argv => {
              networkCmd.logger.debug("==== Running 'chart upgrade' ===")
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
