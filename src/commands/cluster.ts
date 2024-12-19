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
import {ListrEnquirerPromptAdapter} from '@listr2/prompt-adapter-enquirer';
import {Listr} from 'listr2';
import {SoloError} from '../core/errors.js';
import {Flags as flags} from './flags.js';
import {BaseCommand} from './base.js';
import chalk from 'chalk';
import * as constants from '../core/constants.js';
import path from 'path';
import {ListrLease} from '../core/lease/listr_lease.js';
import {type CommandBuilder} from '../types/aliases.js';

/**
 * Define the core functionalities of 'cluster' command
 */
export class ClusterCommand extends BaseCommand {
  showClusterList() {
    this.logger.showList('Clusters', this.k8.getClusters());
    return true;
  }

  /** Get cluster-info for the given cluster name */
  getClusterInfo() {
    try {
      const cluster = this.k8.getKubeConfig().getCurrentCluster();
      this.logger.showJSON(`Cluster Information (${cluster.name})`, cluster);
      this.logger.showUser('\n');
      return true;
    } catch (e: Error | any) {
      this.logger.showUserError(e);
    }

    return false;
  }

  /** Show list of installed chart */
  async showInstalledChartList(clusterSetupNamespace: string) {
    this.logger.showList('Installed Charts', await this.chartManager.getInstalledCharts(clusterSetupNamespace));
  }

  /** Setup cluster with shared components */
  async setup(argv: any) {
    const self = this;

    interface Context {
      config: {
        chartDir: string;
        clusterSetupNamespace: string;
        deployCertManager: boolean;
        deployCertManagerCrds: boolean;
        deployMinio: boolean;
        deployPrometheusStack: boolean;
        soloChartVersion: string;
      };
      isChartInstalled: boolean;
      chartPath: string;
      valuesArg: string;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);
            flags.disablePrompts([flags.chartDirectory]);

            await self.configManager.executePrompt(task, [
              flags.chartDirectory,
              flags.clusterSetupNamespace,
              flags.deployCertManager,
              flags.deployCertManagerCrds,
              flags.deployMinio,
              flags.deployPrometheusStack,
            ]);

            ctx.config = {
              chartDir: self.configManager.getFlag<string>(flags.chartDirectory) as string,
              clusterSetupNamespace: self.configManager.getFlag<string>(flags.clusterSetupNamespace) as string,
              deployCertManager: self.configManager.getFlag<boolean>(flags.deployCertManager) as boolean,
              deployCertManagerCrds: self.configManager.getFlag<boolean>(flags.deployCertManagerCrds) as boolean,
              deployMinio: self.configManager.getFlag<boolean>(flags.deployMinio) as boolean,
              deployPrometheusStack: self.configManager.getFlag<boolean>(flags.deployPrometheusStack) as boolean,
              soloChartVersion: self.configManager.getFlag<string>(flags.soloChartVersion) as string,
            };

            self.logger.debug('Prepare ctx.config', {config: ctx.config, argv});

            ctx.isChartInstalled = await this.chartManager.isChartInstalled(
              ctx.config.clusterSetupNamespace,
              constants.SOLO_CLUSTER_SETUP_CHART,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async (ctx, _) => {
            ctx.chartPath = await this.prepareChartPath(
              ctx.config.chartDir,
              constants.SOLO_TESTING_CHART_URL,
              constants.SOLO_CLUSTER_SETUP_CHART,
            );
            ctx.valuesArg = this.prepareValuesArg(
              ctx.config.chartDir,
              ctx.config.deployPrometheusStack,
              ctx.config.deployMinio,
              ctx.config.deployCertManager,
              ctx.config.deployCertManagerCrds,
            );
          },
          skip: ctx => ctx.isChartInstalled,
        },
        {
          title: `Install '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
          task: async (ctx, _) => {
            const clusterSetupNamespace = ctx.config.clusterSetupNamespace;
            const version = ctx.config.soloChartVersion;
            const valuesArg = ctx.valuesArg;

            try {
              self.logger.debug(`Installing chart chartPath = ${ctx.chartPath}, version = ${version}`);
              await self.chartManager.install(
                clusterSetupNamespace,
                constants.SOLO_CLUSTER_SETUP_CHART,
                ctx.chartPath,
                version,
                valuesArg,
              );
            } catch (e: Error | any) {
              // if error, uninstall the chart and rethrow the error
              self.logger.debug(
                `Error on installing ${constants.SOLO_CLUSTER_SETUP_CHART}. attempting to rollback by uninstalling the chart`,
                e,
              );
              try {
                await self.chartManager.uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
              } catch (ex) {
                // ignore error during uninstall since we are doing the best-effort uninstall here
              }

              throw e;
            }

            if (argv.dev) {
              await self.showInstalledChartList(clusterSetupNamespace);
            }
          },
          skip: ctx => ctx.isChartInstalled,
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e: Error | any) {
      throw new SoloError('Error on cluster setup', e);
    }

    return true;
  }

  async reset(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: {
        clusterName: string;
        clusterSetupNamespace: string;
      };
      isChartInstalled: boolean;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            if (!argv[flags.force.name]) {
              const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
                type: 'toggle',
                default: false,
                message: 'Are you sure you would like to uninstall solo-cluster-setup chart?',
              });

              if (!confirm) {
                process.exit(0);
              }
            }

            self.configManager.update(argv);
            ctx.config = {
              clusterName: self.configManager.getFlag<string>(flags.clusterName) as string,
              clusterSetupNamespace: self.configManager.getFlag<string>(flags.clusterSetupNamespace) as string,
            };

            ctx.isChartInstalled = await this.chartManager.isChartInstalled(
              ctx.config.clusterSetupNamespace,
              constants.SOLO_CLUSTER_SETUP_CHART,
            );
            if (!ctx.isChartInstalled) {
              throw new SoloError('No chart found for the cluster');
            }

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        {
          title: `Uninstall '${constants.SOLO_CLUSTER_SETUP_CHART}' chart`,
          task: async (ctx, _) => {
            const clusterSetupNamespace = ctx.config.clusterSetupNamespace;
            await self.chartManager.uninstall(clusterSetupNamespace, constants.SOLO_CLUSTER_SETUP_CHART);
            if (argv.dev) {
              await self.showInstalledChartList(clusterSetupNamespace);
            }
          },
          skip: ctx => !ctx.isChartInstalled,
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e: Error | any) {
      throw new SoloError('Error on cluster reset', e);
    } finally {
      await lease.release();
    }

    return true;
  }

  /** Return Yargs command definition for 'cluster' command */
  getCommandDefinition(): {command: string; desc: string; builder: CommandBuilder} {
    const self = this;
    return {
      command: 'cluster',
      desc: 'Manage solo testing cluster',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'list',
            desc: 'List all available clusters',
            handler: (argv: any) => {
              self.logger.debug("==== Running 'cluster list' ===", {argv});

              try {
                const r = self.showClusterList();
                self.logger.debug('==== Finished running `cluster list`====');

                if (!r) process.exit(1);
              } catch (err) {
                self.logger.showUserError(err);
                process.exit(1);
              }
            },
          })
          .command({
            command: 'info',
            desc: 'Get cluster info',
            handler: (argv: any) => {
              self.logger.debug("==== Running 'cluster info' ===", {argv});
              try {
                const r = this.getClusterInfo();
                self.logger.debug('==== Finished running `cluster info`====');

                if (!r) process.exit(1);
              } catch (err: Error | any) {
                self.logger.showUserError(err);
                process.exit(1);
              }
            },
          })
          .command({
            command: 'setup',
            desc: 'Setup cluster with shared components',
            builder: (y: any) =>
              flags.setCommandFlags(
                y,
                flags.chartDirectory,
                flags.clusterName,
                flags.clusterSetupNamespace,
                flags.deployCertManager,
                flags.deployCertManagerCrds,
                flags.deployMinio,
                flags.deployPrometheusStack,
                flags.quiet,
                flags.soloChartVersion,
              ),
            handler: (argv: any) => {
              self.logger.debug("==== Running 'cluster setup' ===", {argv});

              self
                .setup(argv)
                .then(r => {
                  self.logger.debug('==== Finished running `cluster setup`====');

                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .command({
            command: 'reset',
            desc: 'Uninstall shared components from cluster',
            builder: (y: any) =>
              flags.setCommandFlags(y, flags.clusterName, flags.clusterSetupNamespace, flags.force, flags.quiet),
            handler: (argv: any) => {
              self.logger.debug("==== Running 'cluster reset' ===", {argv});

              self
                .reset(argv)
                .then(r => {
                  self.logger.debug('==== Finished running `cluster reset`====');

                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .demandCommand(1, 'Select a cluster command');
      },
    };
  }

  /**
   * Prepare values arg for cluster setup command
   *
   * @param [chartDir] - local charts directory (default is empty)
   * @param [prometheusStackEnabled] - a bool to denote whether to install prometheus stack
   * @param [minioEnabled] - a bool to denote whether to install minio
   * @param [certManagerEnabled] - a bool to denote whether to install cert manager
   * @param [certManagerCrdsEnabled] - a bool to denote whether to install cert manager CRDs
   */
  prepareValuesArg(
    chartDir = flags.chartDirectory.definition.defaultValue as string,
    prometheusStackEnabled = flags.deployPrometheusStack.definition.defaultValue as boolean,
    minioEnabled = flags.deployMinio.definition.defaultValue as boolean,
    certManagerEnabled = flags.deployCertManager.definition.defaultValue as boolean,
    certManagerCrdsEnabled = flags.deployCertManagerCrds.definition.defaultValue as boolean,
  ) {
    let valuesArg = chartDir ? `-f ${path.join(chartDir, 'solo-cluster-setup', 'values.yaml')}` : '';

    valuesArg += ` --set cloud.prometheusStack.enabled=${prometheusStackEnabled}`;
    valuesArg += ` --set cloud.minio.enabled=${minioEnabled}`;
    valuesArg += ` --set cloud.certManager.enabled=${certManagerEnabled}`;
    valuesArg += ` --set cert-manager.installCRDs=${certManagerCrdsEnabled}`;

    if (certManagerEnabled && !certManagerCrdsEnabled) {
      this.logger.showUser(
        chalk.yellowBright('> WARNING:'),
        chalk.yellow(
          'cert-manager CRDs are required for cert-manager, please enable it if you have not installed it independently.',
        ),
      );
    }

    return valuesArg;
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
