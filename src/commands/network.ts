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
import chalk from 'chalk';
import {Listr} from 'listr2';
import {IllegalArgumentError, MissingArgumentError, SoloError} from '../core/errors.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import {Templates} from '../core/templates.js';
import * as helpers from '../core/helpers.js';
import {addDebugOptions, resolveValidJsonFilePath, validatePath} from '../core/helpers.js';
import path from 'path';
import fs from 'fs';
import {type KeyManager} from '../core/key_manager.js';
import {type PlatformInstaller} from '../core/platform_installer.js';
import {type ProfileManager} from '../core/profile_manager.js';
import {type CertificateManager} from '../core/certificate_manager.js';
import {type CommandBuilder, type IP, type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {type Opts} from '../types/command_types.js';
import {ListrLease} from '../core/lease/listr_lease.js';
import {ConsensusNodeComponent} from '../core/config/remote/components/consensus_node_component.js';
import {ConsensusNodeStates} from '../core/config/remote/enumerations.js';
import {EnvoyProxyComponent} from '../core/config/remote/components/envoy_proxy_component.js';
import {HaProxyComponent} from '../core/config/remote/components/ha_proxy_component.js';
import {v4 as uuidv4} from 'uuid';
import * as Base64 from 'js-base64';
import type {SoloListrTask} from '../types/index.js';
import type {Namespace} from '../core/config/remote/types.js';

export interface NetworkDeployConfigClass {
  applicationEnv: string;
  cacheDir: string;
  chartDirectory: string;
  enablePrometheusSvcMonitor: boolean;
  loadBalancerEnabled: boolean;
  soloChartVersion: string;
  namespace: string;
  nodeAliasesUnparsed: string;
  persistentVolumeClaims: string;
  profileFile: string;
  profileName: string;
  releaseTag: string;
  chartPath: string;
  keysDir: string;
  nodeAliases: NodeAliases;
  stagingDir: string;
  stagingKeysDir: string;
  valuesArg: string;
  grpcTlsCertificatePath: string;
  grpcWebTlsCertificatePath: string;
  grpcTlsKeyPath: string;
  grpcWebTlsKeyPath: string;
  genesisThrottlesFile: string;
  resolvedThrottlesFile: string;
  getUnusedConfigs: () => string[];
  haproxyIps: string;
  envoyIps: string;
  haproxyIpsParsed?: Record<NodeAlias, IP>;
  envoyIpsParsed?: Record<NodeAlias, IP>;
  storageType: constants.StorageType;
  storageAccessKey: string;
  storageSecrets: string;
  storageEndpoint: string;
  storageBucket: string;
  storageBucketPrefix: string;
  backupBucket: string;
  googleCredential: string;
}

export class NetworkCommand extends BaseCommand {
  private readonly keyManager: KeyManager;
  private readonly platformInstaller: PlatformInstaller;
  private readonly profileManager: ProfileManager;
  private readonly certificateManager: CertificateManager;
  private profileValuesFile?: string;

  constructor(opts: Opts) {
    super(opts);

    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required');
    if (!opts || !opts.keyManager)
      throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager);
    if (!opts || !opts.platformInstaller)
      throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller);
    if (!opts || !opts.profileManager)
      throw new MissingArgumentError('An instance of core/ProfileManager is required', opts.downloader);
    if (!opts || !opts.certificateManager)
      throw new MissingArgumentError('An instance of core/CertificateManager is required', opts.certificateManager);

    this.certificateManager = opts.certificateManager;
    this.keyManager = opts.keyManager;
    this.platformInstaller = opts.platformInstaller;
    this.profileManager = opts.profileManager;
  }

  static get DEPLOY_CONFIGS_NAME() {
    return 'deployConfigs';
  }

  static get DEPLOY_FLAGS_LIST() {
    return [
      flags.apiPermissionProperties,
      flags.app,
      flags.applicationEnv,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.genesisThrottlesFile,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.enablePrometheusSvcMonitor,
      flags.soloChartVersion,
      flags.debugNodeAlias,
      flags.loadBalancerEnabled,
      flags.log4j2Xml,
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.persistentVolumeClaims,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.releaseTag,
      flags.settingTxt,
      flags.valuesFile,
      flags.grpcTlsCertificatePath,
      flags.grpcWebTlsCertificatePath,
      flags.grpcTlsKeyPath,
      flags.grpcWebTlsKeyPath,
      flags.haproxyIps,
      flags.envoyIps,
      flags.storageType,
      flags.storageAccessKey,
      flags.storageSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
      flags.storageBucketPrefix,
      flags.backupBucket,
      flags.googleCredential,
    ];
  }

  async prepareStorageSecrets(config: NetworkDeployConfigClass) {
    try {
      const minioAccessKey = uuidv4();
      const minioSecretKey = uuidv4();
      const minioData = {};
      const namespace = config.namespace;

      // Generating new minio credentials
      const envString = `MINIO_ROOT_USER=${minioAccessKey}\nMINIO_ROOT_PASSWORD=${minioSecretKey}`;
      minioData['config.env'] = Base64.encode(envString);
      const isMinioSecretCreated = await this.k8.createSecret(
        constants.MINIO_SECRET_NAME,
        namespace,
        'Opaque',
        minioData,
        undefined,
        true,
      );
      if (!isMinioSecretCreated) {
        throw new SoloError('ailed to create new minio secret');
      }

      // Generating cloud storage secrets
      const {storageAccessKey, storageSecrets, storageEndpoint} = config;
      const cloudData = {};
      if (
        config.storageType === constants.StorageType.S3_ONLY ||
        config.storageType === constants.StorageType.S3_AND_GCS
      ) {
        cloudData['S3_ACCESS_KEY'] = Base64.encode(storageAccessKey);
        cloudData['S3_SECRET_KEY'] = Base64.encode(storageSecrets);
        cloudData['S3_ENDPOINT'] = Base64.encode(storageEndpoint);
      }
      if (
        config.storageType === constants.StorageType.GCS_ONLY ||
        config.storageType === constants.StorageType.S3_AND_GCS ||
        config.storageType === constants.StorageType.GCS_AND_MINIO
      ) {
        cloudData['GCS_ACCESS_KEY'] = Base64.encode(storageAccessKey);
        cloudData['GCS_SECRET_KEY'] = Base64.encode(storageSecrets);
        cloudData['GCS_ENDPOINT'] = Base64.encode(storageEndpoint);
      }
      if (config.storageType === constants.StorageType.GCS_AND_MINIO) {
        cloudData['S3_ACCESS_KEY'] = Base64.encode(minioAccessKey);
        cloudData['S3_SECRET_KEY'] = Base64.encode(minioSecretKey);
      }

      const isCloudSecretCreated = await this.k8.createSecret(
        constants.UPLOADER_SECRET_NAME,
        namespace,
        'Opaque',
        cloudData,
        undefined,
        true,
      );
      if (!isCloudSecretCreated) {
        throw new SoloError(
          `failed to create Kubernetes secret for storage credentials of type '${config.storageType}'`,
        );
      }
      // generate backup uploader secret
      if (config.googleCredential) {
        const backupData = {};
        const googleCredential = fs.readFileSync(config.googleCredential, 'utf8');
        backupData['saJson'] = Base64.encode(googleCredential);
        const isBackupSecretCreated = await this.k8.createSecret(
          constants.BACKUP_SECRET_NAME,
          namespace,
          'Opaque',
          backupData,
          undefined,
          true,
        );
        if (!isBackupSecretCreated) {
          throw new SoloError(`failed to create Kubernetes secret for backup uploader of type '${config.storageType}'`);
        }
      }
    } catch (e: Error | any) {
      const errorMessage = 'failed to create Kubernetes storage secret ';
      this.logger.error(errorMessage, e);
      throw new SoloError(errorMessage, e);
    }
  }

  async prepareValuesArg(config: {
    chartDirectory?: string;
    app?: string;
    nodeAliases: string[];
    debugNodeAlias?: NodeAlias;
    enablePrometheusSvcMonitor?: boolean;
    releaseTag?: string;
    persistentVolumeClaims?: string;
    valuesFile?: string;
    haproxyIpsParsed?: Record<NodeAlias, IP>;
    envoyIpsParsed?: Record<NodeAlias, IP>;
    storageType: constants.StorageType;
    resolvedThrottlesFile: string;
    storageAccessKey: string;
    storageSecrets: string;
    storageEndpoint: string;
    storageBucket: string;
    storageBucketPrefix: string;
    backupBucket: string;
    googleCredential: string;
    loadBalancerEnabled: boolean;
  }) {
    let valuesArg = config.chartDirectory
      ? `-f ${path.join(config.chartDirectory, 'solo-deployment', 'values.yaml')}`
      : '';

    if (config.app !== constants.HEDERA_APP_NAME) {
      const index = config.nodeAliases.length;
      for (let i = 0; i < index; i++) {
        valuesArg += ` --set "hedera.nodes[${i}].root.extraEnv[0].name=JAVA_MAIN_CLASS"`;
        valuesArg += ` --set "hedera.nodes[${i}].root.extraEnv[0].value=com.swirlds.platform.Browser"`;
      }
      valuesArg = addDebugOptions(valuesArg, config.debugNodeAlias, 1);
    } else {
      valuesArg = addDebugOptions(valuesArg, config.debugNodeAlias);
    }

    if (
      config.storageType === constants.StorageType.S3_AND_GCS ||
      config.storageType === constants.StorageType.GCS_ONLY ||
      config.storageType === constants.StorageType.GCS_AND_MINIO
    ) {
      valuesArg += ' --set cloud.gcs.enabled=true';
    }

    if (
      config.storageType === constants.StorageType.S3_AND_GCS ||
      config.storageType === constants.StorageType.S3_ONLY
    ) {
      valuesArg += ' --set cloud.s3.enabled=true';
    }

    if (
      config.storageType === constants.StorageType.GCS_ONLY ||
      config.storageType === constants.StorageType.S3_ONLY ||
      config.storageType === constants.StorageType.S3_AND_GCS
    ) {
      valuesArg += ' --set cloud.minio.enabled=false';
    }

    if (config.storageType !== constants.StorageType.MINIO_ONLY) {
      valuesArg += ' --set cloud.generateNewSecrets=false';
    }

    if (config.storageBucket) {
      valuesArg += ` --set cloud.buckets.streamBucket=${config.storageBucket}`;
      valuesArg += ` --set minio-server.tenant.buckets[0].name=${config.storageBucket}`;
    }

    if (config.storageBucketPrefix) {
      valuesArg += ` --set cloud.buckets.streamBucketPrefix=${config.storageBucketPrefix}`;
    }

    if (config.backupBucket) {
      valuesArg += ' --set defaults.sidecars.backupUploader.enabled=true';
      valuesArg += ` --set defaults.sidecars.backupUploader.config.backupBucket=${config.backupBucket}`;
    }

    const profileName = this.configManager.getFlag<string>(flags.profileName) as string;
    this.profileValuesFile = await this.profileManager.prepareValuesForSoloChart(profileName);
    if (this.profileValuesFile) {
      valuesArg += this.prepareValuesFiles(this.profileValuesFile);
    }

    valuesArg += ` --set "telemetry.prometheus.svcMonitor.enabled=${config.enablePrometheusSvcMonitor}"`;

    valuesArg += ` --set "defaults.volumeClaims.enabled=${config.persistentVolumeClaims}"`;

    // Iterate over each node and set static IPs for HAProxy
    if (config.haproxyIpsParsed) {
      config.nodeAliases.forEach((nodeAlias, index) => {
        const ip = config.haproxyIpsParsed?.[nodeAlias];

        if (ip) valuesArg += ` --set "hedera.nodes[${index}].haproxyStaticIP=${ip}"`;
      });
    }

    // Iterate over each node and set static IPs for Envoy Proxy
    if (config.envoyIpsParsed) {
      config.nodeAliases.forEach((nodeAlias, index) => {
        const ip = config.envoyIpsParsed?.[nodeAlias];

        if (ip) valuesArg += ` --set "hedera.nodes[${index}].envoyProxyStaticIP=${ip}"`;
      });
    }

    if (config.resolvedThrottlesFile) {
      valuesArg += ` --set-file "hedera.configMaps.genesisThrottlesJson=${config.resolvedThrottlesFile}"`;
    }

    if (config.loadBalancerEnabled) {
      valuesArg += ' --set "defaults.haproxy.serviceType=LoadBalancer"';
      valuesArg += ' --set "defaults.envoyProxy.serviceType=LoadBalancer"';
    }

    if (config.valuesFile) {
      valuesArg += this.prepareValuesFiles(config.valuesFile);
    }

    this.logger.debug('Prepared helm chart values', {valuesArg});
    return valuesArg;
  }

  async prepareConfig(task: any, argv: any) {
    this.configManager.update(argv);
    this.logger.debug('Updated config with argv', {config: this.configManager.config});

    // disable the prompts that we don't want to prompt the user for
    flags.disablePrompts([
      flags.apiPermissionProperties,
      flags.app,
      flags.applicationEnv,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.genesisThrottlesFile,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.debugNodeAlias,
      flags.loadBalancerEnabled,
      flags.log4j2Xml,
      flags.persistentVolumeClaims,
      flags.profileName,
      flags.profileFile,
      flags.settingTxt,
      flags.grpcTlsCertificatePath,
      flags.grpcWebTlsCertificatePath,
      flags.grpcTlsKeyPath,
      flags.grpcWebTlsKeyPath,
      flags.haproxyIps,
      flags.envoyIps,
      flags.storageType,
      flags.storageAccessKey,
      flags.storageSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
      flags.storageBucketPrefix,
    ]);

    await this.configManager.executePrompt(task, NetworkCommand.DEPLOY_FLAGS_LIST);

    // create a config object for subsequent steps
    const config = this.getConfig(NetworkCommand.DEPLOY_CONFIGS_NAME, NetworkCommand.DEPLOY_FLAGS_LIST, [
      'chartPath',
      'keysDir',
      'nodeAliases',
      'stagingDir',
      'stagingKeysDir',
      'valuesArg',
      'resolvedThrottlesFile',
    ]) as NetworkDeployConfigClass;

    config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed);

    if (config.haproxyIps) {
      config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
    }

    if (config.envoyIps) {
      config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
    }

    // compute values
    config.chartPath = await this.prepareChartPath(
      config.chartDirectory,
      constants.SOLO_TESTING_CHART_URL,
      constants.SOLO_DEPLOYMENT_CHART,
    );

    // compute other config parameters
    config.keysDir = path.join(validatePath(config.cacheDir), 'keys');
    config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);
    config.stagingKeysDir = path.join(validatePath(config.stagingDir), 'keys');

    config.resolvedThrottlesFile = resolveValidJsonFilePath(
      config.genesisThrottlesFile,
      flags.genesisThrottlesFile.definition.defaultValue as string,
    );

    config.valuesArg = await this.prepareValuesArg(config);

    if (!(await this.k8.hasNamespace(config.namespace))) {
      await this.k8.createNamespace(config.namespace);
    }

    // prepare staging keys directory
    if (!fs.existsSync(config.stagingKeysDir)) {
      fs.mkdirSync(config.stagingKeysDir, {recursive: true});
    }

    // create cached keys dir if it does not exist yet
    if (!fs.existsSync(config.keysDir)) {
      fs.mkdirSync(config.keysDir);
    }

    // if storageType is set, then we need to set the storage secrets
    if (
      this.configManager.getFlag<string>(flags.storageType) &&
      this.configManager.getFlag<string>(flags.storageAccessKey) &&
      this.configManager.getFlag<string>(flags.storageSecrets) &&
      this.configManager.getFlag<string>(flags.storageEndpoint)
    ) {
      this.logger.debug('Preparing storage secrets');
      await this.prepareStorageSecrets(config);
    }

    this.logger.debug('Prepared config', {
      config,
      cachedConfig: this.configManager.config,
    });
    return config;
  }

  async destroyTask(ctx: any, task: any) {
    const self = this;
    task.title = `Uninstalling chart ${constants.SOLO_DEPLOYMENT_CHART}`;
    await self.chartManager.uninstall(ctx.config.namespace, constants.SOLO_DEPLOYMENT_CHART);

    if (ctx.config.deletePvcs) {
      const pvcs = await self.k8.listPvcsByNamespace(ctx.config.namespace);
      task.title = `Deleting PVCs in namespace ${ctx.config.namespace}`;
      if (pvcs) {
        for (const pvc of pvcs) {
          await self.k8.deletePvc(pvc, ctx.config.namespace);
        }
      }
    }

    if (ctx.config.deleteSecrets) {
      task.title = `Deleting secrets in namespace ${ctx.config.namespace}`;
      const secrets = await self.k8.listSecretsByNamespace(ctx.config.namespace);

      if (secrets) {
        for (const secret of secrets) {
          await self.k8.deleteSecret(secret, ctx.config.namespace);
        }
      }
    }
  }

  /** Run helm install and deploy network components */
  async deploy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: NetworkDeployConfigClass;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            ctx.config = await self.prepareConfig(task, argv);
            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        {
          title: 'Copy gRPC TLS Certificates',
          task: (ctx, parentTask) =>
            self.certificateManager.buildCopyTlsCertificatesTasks(
              parentTask,
              ctx.config.grpcTlsCertificatePath,
              ctx.config.grpcWebTlsCertificatePath,
              ctx.config.grpcTlsKeyPath,
              ctx.config.grpcWebTlsKeyPath,
            ),
          skip: ctx => !ctx.config.grpcTlsCertificatePath && !ctx.config.grpcWebTlsCertificatePath,
        },
        {
          title: 'Check if cluster setup chart is installed',
          task: async () => {
            const isChartInstalled = await this.chartManager.isChartInstalled('', constants.SOLO_CLUSTER_SETUP_CHART);
            if (!isChartInstalled) {
              throw new SoloError(
                `Chart ${constants.SOLO_CLUSTER_SETUP_CHART} is not installed. Run 'solo cluster setup'`,
              );
            }
          },
        },
        {
          title: 'Prepare staging directory',
          task: (_, parentTask) => {
            return parentTask.newListr(
              [
                {
                  title: 'Copy Gossip keys to staging',
                  task: ctx => {
                    const config = ctx.config;

                    this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, config.nodeAliases);
                  },
                },
                {
                  title: 'Copy gRPC TLS keys to staging',
                  task: ctx => {
                    const config = ctx.config;
                    for (const nodeAlias of config.nodeAliases) {
                      const tlsKeyFiles = self.keyManager.prepareTLSKeyFilePaths(nodeAlias, config.keysDir);
                      self.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir);
                    }
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
        {
          title: 'Copy node keys to secrets',
          task: (ctx, parentTask) => {
            const config = ctx.config;

            // set up the subtasks
            return parentTask.newListr(self.platformInstaller.copyNodeKeys(config.stagingDir, config.nodeAliases), {
              concurrent: true,
              rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
            });
          },
        },
        {
          title: `Install chart '${constants.SOLO_DEPLOYMENT_CHART}'`,
          task: async ctx => {
            const config = ctx.config;
            if (await self.chartManager.isChartInstalled(config.namespace, constants.SOLO_DEPLOYMENT_CHART)) {
              await self.chartManager.uninstall(config.namespace, constants.SOLO_DEPLOYMENT_CHART);
            }

            await this.chartManager.install(
              config.namespace,
              constants.SOLO_DEPLOYMENT_CHART,
              ctx.config.chartPath,
              config.soloChartVersion,
              config.valuesArg,
            );
          },
        },
        {
          title: 'Check node pods are running',
          task: (ctx, task) => {
            const subTasks: any[] = [];
            const config = ctx.config;

            // nodes
            for (const nodeAlias of config.nodeAliases) {
              subTasks.push({
                title: `Check Node: ${chalk.yellow(nodeAlias)}`,
                task: async () =>
                  await self.k8.waitForPods(
                    [constants.POD_PHASE_RUNNING],
                    [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'],
                    1,
                    constants.PODS_RUNNING_MAX_ATTEMPTS,
                    constants.PODS_RUNNING_DELAY,
                  ),
              });
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: 'Check proxy pods are running',
          task: (ctx, task) => {
            const subTasks: any[] = [];
            const config = ctx.config;

            // HAProxy
            for (const nodeAlias of config.nodeAliases) {
              subTasks.push({
                title: `Check HAProxy for: ${chalk.yellow(nodeAlias)}`,
                task: async () =>
                  await self.k8.waitForPods(
                    [constants.POD_PHASE_RUNNING],
                    ['solo.hedera.com/type=haproxy'],
                    1,
                    constants.PODS_RUNNING_MAX_ATTEMPTS,
                    constants.PODS_RUNNING_DELAY,
                  ),
              });
            }

            // Envoy Proxy
            for (const nodeAlias of config.nodeAliases) {
              subTasks.push({
                title: `Check Envoy Proxy for: ${chalk.yellow(nodeAlias)}`,
                task: async () =>
                  await self.k8.waitForPods(
                    [constants.POD_PHASE_RUNNING],
                    ['solo.hedera.com/type=envoy-proxy'],
                    1,
                    constants.PODS_RUNNING_MAX_ATTEMPTS,
                    constants.PODS_RUNNING_DELAY,
                  ),
              });
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: 'Check auxiliary pods are ready',
          task: (_, task) => {
            const subTasks = [];

            // minio
            subTasks.push({
              title: 'Check MinIO',
              task: async () =>
                await self.k8.waitForPodReady(
                  ['v1.min.io/tenant=minio'],
                  1,
                  constants.PODS_RUNNING_MAX_ATTEMPTS,
                  constants.PODS_RUNNING_DELAY,
                ),
              // skip if only cloud storage is/are used
              skip: ctx =>
                ctx.config.storageType === constants.StorageType.GCS_ONLY ||
                ctx.config.storageType === constants.StorageType.S3_ONLY ||
                ctx.config.storageType === constants.StorageType.S3_AND_GCS,
            });

            // set up the subtasks
            return task.newListr(subTasks, {
              concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        this.addNodesAndProxies(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e: Error | any) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, e);
    } finally {
      await lease.release();
    }

    return true;
  }

  async destroy(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: {
        deletePvcs: boolean;
        deleteSecrets: boolean;
        namespace: string;
        enableTimeout: boolean;
        force: boolean;
      };
      checkTimeout: boolean;
    }

    let networkDestroySuccess = true;
    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            if (!argv.force) {
              const confirm = await task.prompt(ListrEnquirerPromptAdapter).run({
                type: 'toggle',
                default: false,
                message: 'Are you sure you would like to destroy the network components?',
              });

              if (!confirm) {
                process.exit(0);
              }
            }

            self.configManager.update(argv);
            await self.configManager.executePrompt(task, [flags.deletePvcs, flags.deleteSecrets, flags.namespace]);

            ctx.config = {
              deletePvcs: self.configManager.getFlag<boolean>(flags.deletePvcs) as boolean,
              deleteSecrets: self.configManager.getFlag<boolean>(flags.deleteSecrets) as boolean,
              namespace: self.configManager.getFlag<string>(flags.namespace) as string,
              enableTimeout: self.configManager.getFlag<boolean>(flags.enableTimeout) as boolean,
              force: self.configManager.getFlag<boolean>(flags.force) as boolean,
            };

            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        {
          title: 'Running sub-tasks to destroy network',
          task: async (ctx, task) => {
            if (ctx.config.enableTimeout) {
              const timeoutId = setTimeout(() => {
                const message = `\n\nUnable to finish network destroy in ${constants.NETWORK_DESTROY_WAIT_TIMEOUT} seconds\n\n`;
                self.logger.error(message);
                self.logger.showUser(chalk.red(message));
                networkDestroySuccess = false;

                if (ctx.config.deletePvcs && ctx.config.deleteSecrets && ctx.config.force) {
                  self.k8.deleteNamespace(ctx.config.namespace);
                } else {
                  // If the namespace is not being deleted,
                  // remove all components data from the remote configuration
                  self.remoteConfigManager.deleteComponents();
                }
              }, constants.NETWORK_DESTROY_WAIT_TIMEOUT * 1_000);

              await self.destroyTask(ctx, task);

              clearTimeout(timeoutId);
            } else {
              await self.destroyTask(ctx, task);
            }
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (e: Error | unknown) {
      throw new SoloError('Error destroying network', e);
    } finally {
      await lease.release();
    }

    return networkDestroySuccess;
  }

  /** Run helm upgrade to refresh network components with new settings */
  async refresh(argv: any) {
    const self = this;
    const lease = await self.leaseManager.create();

    interface Context {
      config: NetworkDeployConfigClass;
    }

    const tasks = new Listr<Context>(
      [
        {
          title: 'Initialize',
          task: async (ctx, task) => {
            ctx.config = await self.prepareConfig(task, argv);
            return ListrLease.newAcquireLeaseTask(lease, task);
          },
        },
        {
          title: `Upgrade chart '${constants.SOLO_DEPLOYMENT_CHART}'`,
          task: async ctx => {
            const config = ctx.config;
            await this.chartManager.upgrade(
              config.namespace,
              constants.SOLO_DEPLOYMENT_CHART,
              ctx.config.chartPath,
              config.soloChartVersion,
              config.valuesArg,
            );
          },
        },
        {
          title: 'Waiting for network pods to be running',
          task: async () => {
            await this.k8.waitForPods(
              [constants.POD_PHASE_RUNNING],
              ['solo.hedera.com/type=network-node', 'solo.hedera.com/type=network-node'],
              1,
            );
          },
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
      throw new SoloError(`Error upgrading chart ${constants.SOLO_DEPLOYMENT_CHART}`, e);
    } finally {
      await lease.release();
    }

    return true;
  }

  getCommandDefinition(): {command: string; desc: string; builder: CommandBuilder} {
    const self = this;
    return {
      command: 'network',
      desc: 'Manage solo network deployment',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'deploy',
            desc: "Deploy solo network.  Requires the chart `solo-cluster-setup` to have been installed in the cluster.  If it hasn't the following command can be ran: `solo cluster setup`",
            builder: (y: any) => flags.setCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST),
            handler: (argv: any) => {
              self.logger.info("==== Running 'network deploy' ===");
              self.logger.info(argv);

              self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `network deploy`====');

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
            desc: 'Destroy solo network',
            builder: (y: any) =>
              flags.setCommandFlags(
                y,
                flags.deletePvcs,
                flags.deleteSecrets,
                flags.enableTimeout,
                flags.force,
                flags.namespace,
                flags.quiet,
              ),
            handler: (argv: any) => {
              self.logger.info("==== Running 'network destroy' ===");
              self.logger.info(argv);

              self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `network destroy`====');

                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .command({
            command: 'refresh',
            desc: 'Refresh solo network deployment',
            builder: (y: any) => flags.setCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST),
            handler: (argv: any) => {
              self.logger.info("==== Running 'chart upgrade' ===");
              self.logger.info(argv);

              self
                .refresh(argv)
                .then(r => {
                  self.logger.info('==== Finished running `chart upgrade`====');

                  if (!r) process.exit(1);
                })
                .catch(err => {
                  self.logger.showUserError(err);
                  process.exit(1);
                });
            },
          })
          .demandCommand(1, 'Select a chart command');
      },
    };
  }

  /** Adds the consensus node, envoy and haproxy components to remote config.  */
  public addNodesAndProxies(): SoloListrTask<any> {
    return {
      title: 'Add node and proxies to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (ctx): Promise<void> => {
        const {
          config: {namespace, nodeAliases},
        } = ctx;
        const cluster = this.remoteConfigManager.currentCluster;

        await this.remoteConfigManager.modify(async remoteConfig => {
          for (const nodeAlias of nodeAliases) {
            remoteConfig.components.add(
              nodeAlias,
              new ConsensusNodeComponent(nodeAlias, cluster, namespace, ConsensusNodeStates.INITIALIZED),
            );

            remoteConfig.components.add(
              `envoy-proxy-${nodeAlias}`,
              new EnvoyProxyComponent(`envoy-proxy-${nodeAlias}`, cluster, namespace),
            );

            remoteConfig.components.add(
              `haproxy-${nodeAlias}`,
              new HaProxyComponent(`haproxy-${nodeAlias}`, cluster, namespace),
            );
          }
        });
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
