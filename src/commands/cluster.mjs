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
import { Listr } from 'listr2'
import { SoloError } from '../core/errors.mjs'
import * as flags from './flags.mjs'
import { BaseCommand } from './base.mjs'
import chalk from 'chalk'
import { constants } from '../core/index.mjs'
import * as prompts from './prompts.mjs'
import path from 'path'

/**
 * Define the core functionalities of 'cluster' command
 */
export class ClusterCommand extends BaseCommand {
  /**
   * @returns {Promise<boolean>}
   */
  async showClusterList () {
    this.logger.showList('Clusters', await this.k8.getClusters())
    return true
  }

  /**
   * Get cluster-info for the given cluster name
   * @returns {boolean}
   */
  getClusterInfo () {
    try {
      const cluster = this.k8.getKubeConfig().getCurrentCluster()
      this.logger.showJSON(`Cluster Information (${cluster.name})`, cluster)
      this.logger.showUser('\n')
      return true
    } catch (e) {
      this.logger.showUserError(e)
    }

    return false
  }

  /**
   * Show list of installed chart
   * @param {string} clusterSetupNamespace
   */
  async showInstalledChartList (clusterSetupNamespace) {
    this.logger.showList('Installed Charts', await this.chartManager.getInstalledCharts(clusterSetupNamespace))
  }

  /**
   * Setup cluster with shared components
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async setup (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.chartDirectory,
            flags.clusterSetupNamespace,
            flags.deployCertManager,
            flags.deployCertManagerCrds,
            flags.deployMinio,
            flags.deployPrometheusStack
          ])

          // prepare config
          ctx.config = {
            chartDir: self.configManager.getFlag(flags.chartDirectory),
            clusterSetupNamespace: self.configManager.getFlag(flags.clusterSetupNamespace),
            deployCertManager: self.configManager.getFlag(flags.deployCertManager),
            deployCertManagerCrds: self.configManager.getFlag(flags.deployCertManagerCrds),
            deployMinio: self.configManager.getFlag(flags.deployMinio),
            deployPrometheusStack: self.configManager.getFlag(flags.deployPrometheusStack),
            soloChartVersion: self.configManager.getFlag(flags.soloChartVersion)
          }

          self.logger.debug('Prepare ctx.config', { config: ctx.config, argv })

          ctx.isChartInstalled = await this.chartManager.isChartInstalled(ctx.config.clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART)
        }
      },
      {
        title: 'Prepare chart values',
        task: async (ctx, _) => {
          ctx.chartPath = await this.prepareChartPath(ctx.config.chartDir)
          ctx.valuesArg = this.prepareValuesArg(
            ctx.config.chartDir,
            ctx.config.deployPrometheusStack,
            ctx.config.deployMinio,
            ctx.config.deployCertManager,
            ctx.config.deployCertManagerCrds
          )
        },
        skip: (ctx, _) => ctx.isChartInstalled
      },
      {
        title: `Install '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
        task: async (ctx, _) => {
          const clusterSetupNamespace = ctx.config.clusterSetupNamespace
          const version = ctx.config.soloChartVersion

          const chartPath = ctx.chartPath
          const valuesArg = ctx.valuesArg

          try {
            await self.chartManager.install(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART, chartPath, version, valuesArg)
          } catch (e) {
            // if error, uninstall the chart and rethrow the error
            self.logger.debug(`Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`, e)
            try {
              await self.chartManager.uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART)
            } catch (ex) {
              // ignore error during uninstall since we are doing the best-effort uninstall here
            }

            throw e
          }

          if (argv.dev) {
            await self.showInstalledChartList(clusterSetupNamespace)
          }
        },
        skip: (ctx, _) => ctx.isChartInstalled
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new SoloError('Error on cluster setup', e)
    }

    return true
  }

  /**
   * Uninstall shared components from the cluster and perform any other necessary cleanups
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async reset (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          if (!argv[flags.force.name]) {
            const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
              type: 'toggle',
              default: false,
              message: 'Are you sure you would like to uninstall solo-cluster-setup chart?'
            })

            if (!confirm) {
              process.exit(0)
            }
          }

          self.configManager.update(argv)
          const clusterName = self.configManager.getFlag(flags.clusterName)
          const clusterSetupNamespace = self.configManager.getFlag(flags.clusterSetupNamespace)
          ctx.config = {
            clusterName,
            clusterSetupNamespace
          }

          ctx.isChartInstalled = await this.chartManager.isChartInstalled(ctx.config.clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART)
          if (!ctx.isChartInstalled) {
            throw new SoloError('No chart found for the cluster')
          }
        }
      },
      {
        title: `Uninstall '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
        task: async (ctx, _) => {
          const clusterSetupNamespace = ctx.config.clusterSetupNamespace
          await self.chartManager.uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART)
          if (argv.dev) {
            await self.showInstalledChartList(clusterSetupNamespace)
          }
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
      throw new SoloError('Error on cluster reset', e)
    }

    return true
  }

  /**
   * Return Yargs command definition for 'cluster' command
   * @returns {{command: string, desc: string, builder: Function}}
   */
  getCommandDefinition () {
    const clusterCmd = this
    return {
      command: 'cluster',
      desc: 'Manage solo testing cluster',
      builder: yargs => {
        return yargs
          .command({
            command: 'list',
            desc: 'List all available clusters',
            handler: argv => {
              clusterCmd.logger.debug("==== Running 'cluster list' ===", { argv })

              clusterCmd.showClusterList().then(r => {
                clusterCmd.logger.debug('==== Finished running `cluster list`====')

                if (!r) process.exit(1)
              }).catch(err => {
                clusterCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'info',
            desc: 'Get cluster info',
            handler: argv => {
              clusterCmd.logger.debug("==== Running 'cluster info' ===", { argv })
              clusterCmd.getClusterInfo(argv).then(r => {
                clusterCmd.logger.debug('==== Finished running `cluster info`====')

                if (!r) process.exit(1)
              }).catch(err => {
                clusterCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'setup',
            desc: 'Setup cluster with shared components',
            builder: y => flags.setCommandFlags(y,
              flags.chartDirectory,
              flags.clusterName,
              flags.clusterSetupNamespace,
              flags.deployCertManager,
              flags.deployCertManagerCrds,
              flags.deployMinio,
              flags.deployPrometheusStack,
              flags.soloChartVersion
            ),
            handler: argv => {
              clusterCmd.logger.debug("==== Running 'cluster setup' ===", { argv })

              clusterCmd.setup(argv).then(r => {
                clusterCmd.logger.debug('==== Finished running `cluster setup`====')

                if (!r) process.exit(1)
              }).catch(err => {
                clusterCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'reset',
            desc: 'Uninstall shared components from cluster',
            builder: y => flags.setCommandFlags(y,
              flags.clusterName,
              flags.clusterSetupNamespace,
              flags.force
            ),
            handler: argv => {
              clusterCmd.logger.debug("==== Running 'cluster reset' ===", { argv })

              clusterCmd.reset(argv).then(r => {
                clusterCmd.logger.debug('==== Finished running `cluster reset`====')

                if (!r) process.exit(1)
              }).catch(err => {
                clusterCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .demandCommand(1, 'Select a cluster command')
      }
    }
  }

  /**
   * Prepare values arg for cluster setup command
   *
   * @param {string} chartDir - local charts directory (default is empty)
   * @param {boolean} prometheusStackEnabled - a bool to denote whether to install prometheus stack
   * @param {boolean} minioEnabled - a bool to denote whether to install minio
   * @param {boolean} certManagerEnabled - a bool to denote whether to install cert manager
   * @param {boolean} certManagerCrdsEnabled - a bool to denote whether to install cert manager CRDs
   * @returns {string}
   */
  prepareValuesArg (chartDir = flags.chartDirectory.definition.default,
    prometheusStackEnabled = flags.deployPrometheusStack.definition.default,
    minioEnabled = flags.deployMinio.definition.default,
    certManagerEnabled = flags.deployCertManager.definition.default,
    certManagerCrdsEnabled = flags.deployCertManagerCrds.definition.default
  ) {
    let valuesArg = ''
    if (chartDir) {
      valuesArg = `-f ${path.join(chartDir, 'solo-cluster-setup', 'values.yaml')}`
    }

    valuesArg += ` --set cloud.prometheusStack.enabled=${prometheusStackEnabled}`
    valuesArg += ` --set cloud.minio.enabled=${minioEnabled}`
    valuesArg += ` --set cloud.certManager.enabled=${certManagerEnabled}`
    valuesArg += ` --set cert-manager.installCRDs=${certManagerCrdsEnabled}`

    if (certManagerEnabled && !certManagerCrdsEnabled) {
      this.logger.showUser(chalk.yellowBright('> WARNING:'), chalk.yellow(
        'cert-manager CRDs are required for cert-manager, please enable it if you have not installed it independently.'))
    }

    return valuesArg
  }

  /**
   * Prepare chart path
   * @param {string} [chartDir] - local charts directory (default is empty)
   * @returns {Promise<string>}
   */
  async prepareChartPath (chartDir = flags.chartDirectory.definition.default) {
    let chartPath = 'solo-charts/solo-cluster-setup'
    if (chartDir) {
      chartPath = path.join(chartDir, 'solo-cluster-setup')
      await this.helm.dependency('update', chartPath)
    }

    return chartPath
  }
}
