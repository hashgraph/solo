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
import {SoloError, IllegalArgumentError, MissingArgumentError} from '../core/errors.js';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account_manager.js';
import {type ProfileManager} from '../core/profile_manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {getEnvValue} from '../core/helpers.js';
import {RemoteConfigTasks} from '../core/config/remote/remote_config_tasks.js';
import {type CommandBuilder, type PodName} from '../types/aliases.js';
import {type Opts} from '../types/command_types.js';
import {ListrLease} from '../core/lease/listr_lease.js';
import {ComponentType} from '../core/config/remote/enumerations.js';
import {MirrorNodeComponent} from '../core/config/remote/components/mirror_node_component.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {Optional, SoloListrTask} from '../types/index.js';
import type {Namespace} from '../core/config/remote/types.js';

interface MirrorNodeDeployConfigClass {
  chartDirectory: string;
  deployHederaExplorer: boolean;
  enableHederaExplorerTls: boolean;
  hederaExplorerTlsHostName: string;
  hederaExplorerTlsLoadBalancerIp: string | '';
  hederaExplorerVersion: string;
  namespace: string;
  profileFile: string;
  profileName: string;
  tlsClusterIssuerType: string;
  valuesFile: string;
  chartPath: string;
  valuesArg: string;
  mirrorNodeVersion: string;
  getUnusedConfigs: () => string[];
  clusterSetupNamespace: string;
  soloChartVersion: string;
  pinger: boolean;
  customMirrorNodeDatabaseValuePath: Optional<string>;
  storageType: constants.StorageType;
  storageAccessKey: string;
  storageSecrets: string;
  storageEndpoint: string;
  storageBucket: string;
}

interface Context {
  config: MirrorNodeDeployConfigClass;
  addressBook: string;
}

export class MirrorNodeCommand extends BaseCommand {
  private readonly accountManager: AccountManager;
  private readonly profileManager: ProfileManager;

  constructor(opts: Opts) {
    super(opts);
    if (!opts || !opts.accountManager)
      throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager);
    if (!opts || !opts.profileManager)
      throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader);

    this.accountManager = opts.accountManager;
    this.profileManager = opts.profileManager;
  }

  static get DEPLOY_CONFIGS_NAME() {
    return 'deployConfigs';
  }

  static get DEPLOY_FLAGS_LIST() {
    return [
      flags.chartDirectory,
      flags.deployHederaExplorer,
      flags.enableHederaExplorerTls,
      flags.hederaExplorerTlsHostName,
      flags.hederaExplorerTlsLoadBalancerIp,
      flags.hederaExplorerVersion,
      flags.namespace,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.tlsClusterIssuerType,
      flags.valuesFile,
      flags.mirrorNodeVersion,
      flags.pinger,
      flags.clusterSetupNamespace,
      flags.soloChartVersion,
      flags.customMirrorNodeDatabaseValuePath,
      flags.storageType,
      flags.storageAccessKey,
      flags.storageSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
    ];
  }

  async prepareHederaExplorerValuesArg(config: {valuesFile: string}) {
    let valuesArg = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesHederaExplorerChart(profileName);
    if (profileValuesFile) {
      valuesArg += this.prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile);
    }

    valuesArg += ` --set proxyPass./api="http://${constants.MIRROR_NODE_RELEASE_NAME}-rest" `;
    return valuesArg;
  }

  /**
   * @param config
   * @param config.tlsClusterIssuerType - must be one of - acme-staging, acme-prod, or self-signed
   * @param config.namespace - used for classname ingress class name prefix
   * @param config.hederaExplorerTlsLoadBalancerIp - can be an empty string
   * @param config.hederaExplorerTlsHostName
   */
  private async prepareSoloChartSetupValuesArg(config: MirrorNodeDeployConfigClass) {
    const {tlsClusterIssuerType, namespace, hederaExplorerTlsLoadBalancerIp, hederaExplorerTlsHostName} = config;

    let valuesArg = '';

    if (!['acme-staging', 'acme-prod', 'self-signed'].includes(tlsClusterIssuerType)) {
      throw new Error(
        `Invalid TLS cluster issuer type: ${tlsClusterIssuerType}, must be one of: "acme-staging", "acme-prod", or "self-signed"`,
      );
    }

    // Install ingress controller only if it's not already present
    if (!(await this.k8.isIngressControllerInstalled())) {
      valuesArg += ' --set ingress.enabled=true';
      valuesArg += ' --set haproxyIngressController.enabled=true';
      valuesArg += ` --set ingressClassName=${namespace}-hedera-explorer-ingress-class`;
      valuesArg += ` --set-json 'ingress.hosts[0]={"host":"${hederaExplorerTlsHostName}","paths":[{"path":"/","pathType":"Prefix"}]}'`;
    }

    if (!(await this.k8.isCertManagerInstalled())) {
      valuesArg += ' --set cloud.certManager.enabled=true';
      valuesArg += ' --set cert-manager.installCRDs=true';
    }

    if (hederaExplorerTlsLoadBalancerIp !== '') {
      valuesArg += ` --set haproxy-ingress.controller.service.loadBalancerIP=${hederaExplorerTlsLoadBalancerIp}`;
    }

    if (tlsClusterIssuerType === 'self-signed') {
      valuesArg += ' --set selfSignedClusterIssuer.enabled=true';
    } else {
      valuesArg += ' --set acmeClusterIssuer.enabled=true';
      valuesArg += ` --set certClusterIssuerType=${tlsClusterIssuerType}`;
    }

    return valuesArg;
  }

  async prepareValuesArg(config: MirrorNodeDeployConfigClass) {
    let valuesArg = '';

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    const profileValuesFile = await this.profileManager.prepareValuesForMirrorNodeChart(profileName);
    if (profileValuesFile) {
      valuesArg += this.prepareValuesFiles(profileValuesFile);
    }

    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile);
    }

    if (config.storageBucket) {
      valuesArg += ` --set importer.config.hedera.mirror.importer.downloader.bucketName=${config.storageBucket}`;
    }

    let storageType = '';
    if (config.storageType && config.storageAccessKey && config.storageSecrets && config.storageEndpoint) {
      if (
        config.storageType === constants.StorageType.GCS_ONLY ||
        config.storageType === constants.StorageType.S3_AND_GCS ||
        config.storageType === constants.StorageType.GCS_AND_MINIO
      ) {
        storageType = 'gcp';
      } else if (config.storageType === constants.StorageType.S3_ONLY) {
        storageType = 's3';
      } else {
        throw new IllegalArgumentError(`Invalid cloud storage type: ${config.storageType}`);
      }
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_TYPE=${storageType}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_URI=${config.storageEndpoint}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_CREDENTIALS_ACCESSKEY=${config.storageAccessKey}`;
      valuesArg += ` --set importer.env.HEDERA_MIRROR_IMPORTER_DOWNLOADER_SOURCES_0_CREDENTIALS_SECRETKEY=${config.storageSecrets}`;
    }
    return valuesArg;
  }

  async deploy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            self.configManager.update(argv);

            // disable the prompts that we don't want to prompt the user for
            flags.disablePrompts([
              flags.deployHederaExplorer,
              flags.enableHederaExplorerTls,
              flags.hederaExplorerTlsHostName,
              flags.hederaExplorerTlsLoadBalancerIp,
              flags.hederaExplorerVersion,
              flags.tlsClusterIssuerType,
              flags.valuesFile,
              flags.mirrorNodeVersion,
              flags.pinger,
              flags.soloChartVersion,
            ]);

            await self.configManager.executePrompt(task, MirrorNodeCommand.DEPLOY_FLAGS_LIST);

            ctx.config = this.getConfig(MirrorNodeCommand.DEPLOY_CONFIGS_NAME, MirrorNodeCommand.DEPLOY_FLAGS_LIST, [
              'chartPath',
              'valuesArg',
            ]) as MirrorNodeDeployConfigClass;

            ctx.config.chartPath = await self.prepareChartPath(
              '', // don't use chartPath which is for local solo-charts only
              constants.MIRROR_NODE_RELEASE_NAME,
              constants.MIRROR_NODE_CHART,
            );

            // predefined values first
            ctx.config.valuesArg += this.prepareValuesFiles(constants.MIRROR_NODE_VALUES_FILE);
            // user defined values later to override predefined values
            ctx.config.valuesArg += await self.prepareValuesArg(ctx.config);

            if (ctx.config.pinger) {
              const startAccId = constants.HEDERA_NODE_ACCOUNT_ID_START;
              const networkPods = await this.k8.getPodsByLabel(['solo.hedera.com/type=network-node']);

              if (networkPods.length) {
                const pod = networkPods[0];
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.nodes.0.accountId=${startAccId}`;
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.nodes.0.host=${pod.status.podIP}`;

                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.accountId=${constants.OPERATOR_ID}`;
                ctx.config.valuesArg += ` --set monitor.config.hedera.mirror.monitor.operator.privateKey=${constants.OPERATOR_KEY}`;
              }
            }

            if (!(await self.k8.hasNamespace(ctx.config.namespace))) {
              throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
            }

            await self.accountManager.loadNodeClient(ctx.config.namespace);

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        RemoteConfigTasks.loadRemoteConfig.bind(this)(argv),
        {
          title: 'Enable mirror-node',
          task: (_, parentTask) => {
            return parentTask.newListr<Context>(
              [
                {
                  title: 'Prepare address book',
                  task: async ctx => {
                    ctx.addressBook = await self.accountManager.prepareAddressBookBase64();
                    ctx.config.valuesArg += ` --set "importer.addressBook=${ctx.addressBook}"`;
                  },
                },
                {
                  title: 'Upgrade solo-setup chart',
                  task: async ctx => {
                    const config = ctx.config;
                    const {chartDirectory, clusterSetupNamespace, soloChartVersion} = config;

                    const chartPath = await this.prepareChartPath(
                      chartDirectory,
                      constants.SOLO_TESTING_CHART_URL,
                      constants.SOLO_CLUSTER_SETUP_CHART,
                    );

                    const soloChartSetupValuesArg = await self.prepareSoloChartSetupValuesArg(config);

                    // if cert-manager isn't already installed we want to install it separate from the certificate issuers
                    // as they will fail to be created due to the order of the installation being dependent on the cert-manager
                    // being installed first
                    if (soloChartSetupValuesArg.includes('cloud.certManager.enabled=true')) {
                      await self.chartManager.upgrade(
                        clusterSetupNamespace,
                        constants.SOLO_CLUSTER_SETUP_CHART,
                        chartPath,
                        soloChartVersion,
                        '  --set cloud.certManager.enabled=true --set cert-manager.installCRDs=true',
                      );
                    }

                    await self.chartManager.upgrade(
                      clusterSetupNamespace,
                      constants.SOLO_CLUSTER_SETUP_CHART,
                      chartPath,
                      soloChartVersion,
                      soloChartSetupValuesArg,
                    );
                  },
                  skip: ctx => !ctx.config.enableHederaExplorerTls,
                },
                {
                  title: 'Deploy mirror-node',
                  task: async ctx => {
                    if (ctx.config.customMirrorNodeDatabaseValuePath) {
                      if (!fs.existsSync(ctx.config.customMirrorNodeDatabaseValuePath)) {
                        throw new SoloError('Path provided for custom mirror node database value is not found');
                      }

                      // Check if the file has a .yaml or .yml extension
                      const fileExtension = path.extname(ctx.config.customMirrorNodeDatabaseValuePath);
                      if (fileExtension !== '.yaml' && fileExtension !== '.yml') {
                        throw new SoloError('The provided file is not a valid YAML file (.yaml or .yml)');
                      }

                      ctx.config.valuesArg += ` --values ${ctx.config.customMirrorNodeDatabaseValuePath}`;
                    }

                    await self.chartManager.install(
                      ctx.config.namespace,
                      constants.MIRROR_NODE_RELEASE_NAME,
                      ctx.config.chartPath,
                      ctx.config.mirrorNodeVersion,
                      ctx.config.valuesArg,
                    );
                  },
                },
                {
                  title: 'Deploy hedera-explorer',
                  task: async ctx => {
                    const config = ctx.config;

                    let exploreValuesArg = self.prepareValuesFiles(constants.EXPLORER_VALUES_FILE);
                    exploreValuesArg += await self.prepareHederaExplorerValuesArg(config);

                    await self.chartManager.install(
                      config.namespace,
                      constants.HEDERA_EXPLORER_RELEASE_NAME,
                      constants.HEDERA_EXPLORER_CHART_URL,
                      config.hederaExplorerVersion,
                      exploreValuesArg,
                    );
                  },
                  skip: ctx => !ctx.config.deployHederaExplorer,
                },
              ],
              {
                concurrent: false,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        {
          title: 'Check pods are ready',
          task: (_, parentTask) => {
            return parentTask.newListr(
              [
                {
                  title: 'Check Postgres DB',
                  task: async () =>
                    await self.k8.waitForPodReady(
                      ['app.kubernetes.io/component=postgresql', 'app.kubernetes.io/name=postgres'],
                      1,
                      constants.PODS_READY_MAX_ATTEMPTS,
                      constants.PODS_READY_DELAY,
                    ),
                  skip: ctx => !!ctx.config.customMirrorNodeDatabaseValuePath,
                },
                {
                  title: 'Check REST API',
                  task: async () =>
                    await self.k8.waitForPodReady(
                      ['app.kubernetes.io/component=rest', 'app.kubernetes.io/name=rest'],
                      1,
                      constants.PODS_READY_MAX_ATTEMPTS,
                      constants.PODS_READY_DELAY,
                    ),
                },
                {
                  title: 'Check GRPC',
                  task: async () =>
                    await self.k8.waitForPodReady(
                      ['app.kubernetes.io/component=grpc', 'app.kubernetes.io/name=grpc'],
                      1,
                      constants.PODS_READY_MAX_ATTEMPTS,
                      constants.PODS_READY_DELAY,
                    ),
                },
                {
                  title: 'Check Monitor',
                  task: async () =>
                    await self.k8.waitForPodReady(
                      ['app.kubernetes.io/component=monitor', 'app.kubernetes.io/name=monitor'],
                      1,
                      constants.PODS_READY_MAX_ATTEMPTS,
                      constants.PODS_READY_DELAY,
                    ),
                },
                {
                  title: 'Check Importer',
                  task: async () =>
                    await self.k8.waitForPodReady(
                      ['app.kubernetes.io/component=importer', 'app.kubernetes.io/name=importer'],
                      1,
                      constants.PODS_READY_MAX_ATTEMPTS,
                      constants.PODS_READY_DELAY,
                    ),
                },
                {
                  title: 'Check Hedera Explorer',
                  skip: ctx => !ctx.config.deployHederaExplorer,
                  task: async () =>
                    await self.k8.waitForPodReady(
                      ['app.kubernetes.io/component=hedera-explorer', 'app.kubernetes.io/name=hedera-explorer-chart'],
                      1,
                      constants.PODS_READY_MAX_ATTEMPTS,
                      constants.PODS_READY_DELAY,
                    ),
                },
              ],
              {
                concurrent: true,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        {
          title: 'Seed DB data',
          task: (_, parentTask) => {
            return parentTask.newListr(
              [
                {
                  title: 'Insert data in public.file_data',
                  task: async ctx => {
                    const namespace = self.configManager.getFlag<string>(flags.namespace) as string;

                    const feesFileIdNum = 111;
                    const exchangeRatesFileIdNum = 112;
                    const timestamp = Date.now();

                    const fees = await this.accountManager.getFileContents(namespace, feesFileIdNum);
                    const exchangeRates = await this.accountManager.getFileContents(namespace, exchangeRatesFileIdNum);

                    const importFeesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id, transaction_type) VALUES (decode('${fees}', 'hex'), ${timestamp + '000000'}, ${feesFileIdNum}, 17);`;
                    const importExchangeRatesQuery = `INSERT INTO public.file_data(file_data, consensus_timestamp, entity_id, transaction_type) VALUES (decode('${exchangeRates}', 'hex'), ${
                      timestamp + '000001'
                    }, ${exchangeRatesFileIdNum}, 17);`;
                    const sqlQuery = [importFeesQuery, importExchangeRatesQuery].join('\n');

                    if (ctx.config.customMirrorNodeDatabaseValuePath) {
                      fs.writeFileSync(path.join(constants.SOLO_CACHE_DIR, 'database-seeding-query.sql'), sqlQuery);
                      return;
                    }

                    const pods = await this.k8.getPodsByLabel(['app.kubernetes.io/name=postgres']);
                    if (pods.length === 0) {
                      throw new SoloError('postgres pod not found');
                    }
                    const postgresPodName = pods[0].metadata.name as PodName;
                    const postgresContainerName = 'postgresql';
                    const mirrorEnvVars = await self.k8.execContainer(
                      postgresPodName,
                      postgresContainerName,
                      '/bin/bash -c printenv',
                    );
                    const mirrorEnvVarsArray = mirrorEnvVars.split('\n');
                    const HEDERA_MIRROR_IMPORTER_DB_OWNER = getEnvValue(
                      mirrorEnvVarsArray,
                      'HEDERA_MIRROR_IMPORTER_DB_OWNER',
                    );
                    const HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD = getEnvValue(
                      mirrorEnvVarsArray,
                      'HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD',
                    );
                    const HEDERA_MIRROR_IMPORTER_DB_NAME = getEnvValue(
                      mirrorEnvVarsArray,
                      'HEDERA_MIRROR_IMPORTER_DB_NAME',
                    );

                    await self.k8.execContainer(postgresPodName, postgresContainerName, [
                      'psql',
                      `postgresql://${HEDERA_MIRROR_IMPORTER_DB_OWNER}:${HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD}@localhost:5432/${HEDERA_MIRROR_IMPORTER_DB_NAME}`,
                      '-c',
                      sqlQuery,
                    ]);
                  },
                },
              ],
              {
                concurrent: false,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        this.addMirrorNodeComponents(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      self.logger.debug('mirror node deployment has completed');
    } catch (e) {
      const message = `Error deploying node: ${e.message}`;
      self.logger.error(message, e);
      throw new SoloError(message, e);
    } finally {
      await lease.release();
      await self.accountManager.close();
    }

    return true;
  }

  async destroy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: {
        namespace: string;
        isChartInstalled: boolean;
      };
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            if (!argv.force) {
              const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
                type: 'toggle',
                default: false,
                message: 'Are you sure you would like to destroy the mirror-node components?',
              });

              if (!confirm) {
                process.exit(0);
              }
            }

            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.namespace]);

            // @ts-ignore
            ctx.config = {
              namespace: self.configManager.getFlag<string>(flags.namespace),
            };

            if (!(await self.k8.hasNamespace(ctx.config.namespace))) {
              throw new SoloError(`namespace ${ctx.config.namespace} does not exist`);
            }

            ctx.config.isChartInstalled = await this.chartManager.isChartInstalled(
              ctx.config.namespace,
              constants.MIRROR_NODE_RELEASE_NAME,
            );

            await self.accountManager.loadNodeClient(ctx.config.namespace);

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        RemoteConfigTasks.loadRemoteConfig.bind(this)(argv),
        {
          title: 'Destroy mirror-node',
          task: async ctx => {
            await this.chartManager.uninstall(ctx.config.namespace, constants.MIRROR_NODE_RELEASE_NAME);
            await this.chartManager.uninstall(ctx.config.namespace, constants.HEDERA_EXPLORER_RELEASE_NAME);
          },
          skip: ctx => !ctx.config.isChartInstalled,
        },
        {
          title: 'Delete PVCs',
          task: async ctx => {
            const pvcs = await self.k8.listPvcsByNamespace(ctx.config.namespace, [
              'app.kubernetes.io/component=postgresql',
              'app.kubernetes.io/instance=solo-deployment',
              'app.kubernetes.io/name=postgres',
            ]);

            if (pvcs) {
              for (const pvc of pvcs) {
                await self.k8.deletePvc(pvc, ctx.config.namespace);
              }
            }
          },
          skip: ctx => !ctx.config.isChartInstalled,
        },
        this.removeMirrorNodeComponents(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
      self.logger.debug('mirror node destruction has completed');
    } catch (e) {
      throw new SoloError(`Error destrong mirror node: ${e.message}`, e);
    } finally {
      await lease.release();
      await self.accountManager.close();
    }

    return true;
  }

  /** Return Yargs command definition for 'mirror-mirror-node' command */
  getCommandDefinition(): {command: string; desc: string; builder: CommandBuilder} {
    const self = this;
    return {
      command: 'mirror-node',
      desc: 'Manage Hedera Mirror Node in solo network',
      builder: yargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy mirror-node and its components',
            builder: y => flags.setCommandFlags(y, ...MirrorNodeCommand.DEPLOY_FLAGS_LIST),
            handler: argv => {
              self.logger.info("==== Running 'mirror-node deploy' ===");
              self.logger.info(argv);

              self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `mirror-node deploy`====');
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy mirror-node components and database',
            builder: y => flags.setCommandFlags(y, flags.chartDirectory, flags.force, flags.namespace),
            handler: argv => {
              self.logger.info("==== Running 'mirror-node destroy' ===");
              self.logger.info(argv);

              self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `mirror-node destroy`====');
                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .demandCommand(1, 'Select a mirror-node command');
      },
    };
  }

  /** Removes the mirror node and mirror node explorer components from remote config. */
  public removeMirrorNodeComponents(): SoloListrTask<object> {
    return {
      title: 'Remove mirror node and mirror node explorer from remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          remoteConfig.components.remove('mirrorNode', ComponentType.MirrorNode);

          remoteConfig.components.remove('mirrorNodeExplorer', ComponentType.MirrorNode);
        });
      },
    };
  }

  /** Adds the mirror node and mirror node explorer components to remote config. */
  public addMirrorNodeComponents(): SoloListrTask<{config: {namespace: Namespace}}> {
    return {
      title: 'Add mirror node and mirror node explorer to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        await this.remoteConfigManager.modify(async remoteConfig => {
          const {
            config: {namespace},
          } = ctx;
          const cluster = this.remoteConfigManager.currentCluster;

          remoteConfig.components.add('mirrorNode', new MirrorNodeComponent('mirrorNode', cluster, namespace));

          remoteConfig.components.add(
            'mirrorNodeExplorer',
            new MirrorNodeComponent('mirrorNodeExplorer', cluster, namespace),
          );
        });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
