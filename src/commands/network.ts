// SPDX-License-Identifier: Apache-2.0

import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import chalk from 'chalk';
import {Listr} from 'listr2';
import {IllegalArgumentError} from '../core/errors/illegal-argument-error.js';
import {MissingArgumentError} from '../core/errors/missing-argument-error.js';
import {SoloError} from '../core/errors/solo-error.js';
import {UserBreak} from '../core/errors/user-break.js';
import {BaseCommand, type Options} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import {SOLO_DEPLOYMENT_CHART} from '../core/constants.js';
import {Templates} from '../core/templates.js';
import {
  addDebugOptions,
  parseNodeAliases,
  resolveValidJsonFilePath,
  showVersionBanner,
  sleep,
} from '../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import fs from 'node:fs';
import {type KeyManager} from '../core/key-manager.js';
import {type PlatformInstaller} from '../core/platform-installer.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type CertificateManager} from '../core/certificate-manager.js';
import {
  type AnyListrContext,
  type AnyYargs,
  type ArgvStruct,
  type IP,
  type NodeAlias,
  type NodeAliases,
} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {type Lock} from '../core/lock/lock.js';
import {v4 as uuidv4} from 'uuid';
import {
  type CommandDefinition,
  type PrivateKeyAndCertificateObject,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {type ConsensusNode} from '../core/model/consensus-node.js';
import {
  type ClusterReference,
  type ClusterReferences,
  type Context,
  type NamespaceNameAsString,
} from '../core/config/remote/types.js';
import {Base64} from 'js-base64';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {Duration} from '../core/time/duration.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {PathEx} from '../business/utils/path-ex.js';
import {ConsensusNodeStates} from '../core/config/remote/enumerations/consensus-node-states.js';
import {ComponentFactory} from '../core/config/remote/components/component-factory.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Service} from '../integration/kube/resources/service/service.js';
import {type LoadBalancerIngress} from '../integration/kube/resources/load-balancer-ingress.js';
import {type K8} from '../integration/kube/k8.js';
import {type BlockNodeComponent} from '../core/config/remote/components/block-node-component.js';
import {BlockNodesJsonWrapper} from '../core/block-nodes-json-wrapper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';

export interface NetworkDeployConfigClass {
  applicationEnv: string;
  cacheDir: string;
  chartDirectory: string;
  enablePrometheusSvcMonitor: boolean;
  loadBalancerEnabled: boolean;
  soloChartVersion: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  persistentVolumeClaims: string;
  profileFile: string;
  profileName: string;
  releaseTag: string;
  keysDir: string;
  nodeAliases: NodeAliases;
  stagingDir: string;
  stagingKeysDir: string;
  valuesFile: string;
  valuesArgMap: Record<ClusterReference, string>;
  grpcTlsCertificatePath: string;
  grpcWebTlsCertificatePath: string;
  grpcTlsKeyPath: string;
  grpcWebTlsKeyPath: string;
  genesisThrottlesFile: string;
  resolvedThrottlesFile: string;
  haproxyIps: string;
  envoyIps: string;
  haproxyIpsParsed?: Record<NodeAlias, IP>;
  envoyIpsParsed?: Record<NodeAlias, IP>;
  storageType: constants.StorageType;
  gcsWriteAccessKey: string;
  gcsWriteSecrets: string;
  gcsEndpoint: string;
  gcsBucket: string;
  gcsBucketPrefix: string;
  awsWriteAccessKey: string;
  awsWriteSecrets: string;
  awsEndpoint: string;
  awsBucket: string;
  awsBucketPrefix: string;
  backupBucket: string;
  backupWriteSecrets: string;
  backupWriteAccessKey: string;
  backupEndpoint: string;
  backupRegion: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  clusterRefs: ClusterReferences;
  domainNames?: string;
  domainNamesMapping?: Record<NodeAlias, string>;
  activeBlockNodeComponents: BlockNodeComponent[];
  debugNodeAlias: NodeAlias;
  app: string;
}

interface NetworkDeployContext {
  config: NetworkDeployConfigClass;
}

export interface NetworkDestroyContext {
  config: {
    deletePvcs: boolean;
    deleteSecrets: boolean;
    namespace: NamespaceName;
    enableTimeout: boolean;
    force: boolean;
    contexts: string[];
    deployment: string;
  };
  checkTimeout: boolean;
}

export class NetworkCommand extends BaseCommand {
  private readonly keyManager: KeyManager;
  private readonly platformInstaller: PlatformInstaller;
  private readonly profileManager: ProfileManager;
  private readonly certificateManager: CertificateManager;
  private profileValuesFile?: Record<ClusterReference, string>;

  public constructor(options: Options) {
    super(options);

    if (!options || !options.k8Factory) {
      throw new Error('An instance of core/K8Factory is required');
    }
    if (!options || !options.keyManager) {
      throw new IllegalArgumentError('An instance of core/KeyManager is required', options.keyManager);
    }
    if (!options || !options.platformInstaller) {
      throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', options.platformInstaller);
    }
    if (!options || !options.profileManager) {
      throw new MissingArgumentError('An instance of core/ProfileManager is required', options.downloader);
    }
    if (!options || !options.certificateManager) {
      throw new MissingArgumentError('An instance of core/CertificateManager is required', options.certificateManager);
    }

    this.certificateManager = options.certificateManager;
    this.keyManager = options.keyManager;
    this.platformInstaller = options.platformInstaller;
    this.profileManager = options.profileManager;
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deletePvcs, flags.deleteSecrets, flags.enableTimeout, flags.force, flags.deployment, flags.quiet],
  };

  private static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
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
      flags.deployment,
      flags.persistentVolumeClaims,
      flags.profileFile,
      flags.profileName,
      flags.quiet,
      flags.releaseTag,
      flags.settingTxt,
      flags.networkDeploymentValuesFile,
      flags.nodeAliasesUnparsed,
      flags.grpcTlsCertificatePath,
      flags.grpcWebTlsCertificatePath,
      flags.grpcTlsKeyPath,
      flags.grpcWebTlsKeyPath,
      flags.haproxyIps,
      flags.envoyIps,
      flags.storageType,
      flags.gcsWriteAccessKey,
      flags.gcsWriteSecrets,
      flags.gcsEndpoint,
      flags.gcsBucket,
      flags.gcsBucketPrefix,
      flags.awsWriteAccessKey,
      flags.awsWriteSecrets,
      flags.awsEndpoint,
      flags.awsBucket,
      flags.awsBucketPrefix,
      flags.backupBucket,
      flags.backupWriteAccessKey,
      flags.backupWriteSecrets,
      flags.backupEndpoint,
      flags.backupRegion,
      flags.domainNames,
    ],
  };

  public static readonly COMMAND_NAME: string = 'network';

  private waitForNetworkPods(): SoloListrTask<NetworkDeployContext> {
    return {
      title: 'Check node pods are running',
      task: (context_, task): SoloListr<NetworkDeployContext> => {
        const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
        const config: NetworkDeployConfigClass = context_.config;

        for (const consensusNode of config.consensusNodes) {
          subTasks.push({
            title: `Check Node: ${chalk.yellow(consensusNode.name)}, Cluster: ${chalk.yellow(consensusNode.cluster)}`,
            task: async (): Promise<void> => {
              await this.k8Factory
                .getK8(consensusNode.context)
                .pods()
                .waitForRunningPhase(
                  config.namespace,
                  [`solo.hedera.com/node-name=${consensusNode.name}`, 'solo.hedera.com/type=network-node'],
                  constants.PODS_RUNNING_MAX_ATTEMPTS,
                  constants.PODS_RUNNING_DELAY,
                );
            },
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
    };
  }

  private async prepareMinioSecrets(
    config: NetworkDeployConfigClass,
    minioAccessKey: string,
    minioSecretKey: string,
  ): Promise<void> {
    // Generating new minio credentials
    const minioData: Record<string, string> = {};
    const namespace: NamespaceName = config.namespace;
    const environmentString: string = `MINIO_ROOT_USER=${minioAccessKey}\nMINIO_ROOT_PASSWORD=${minioSecretKey}`;
    minioData['config.env'] = Base64.encode(environmentString);

    // create minio secret in each cluster
    for (const context of config.contexts) {
      this.logger.debug(`creating minio secret using context: ${context}`);

      const isMinioSecretCreated: boolean = await this.k8Factory
        .getK8(context)
        .secrets()
        .createOrReplace(namespace, constants.MINIO_SECRET_NAME, SecretType.OPAQUE, minioData);

      if (!isMinioSecretCreated) {
        throw new SoloError(`failed to create new minio secret using context: ${context}`);
      }

      this.logger.debug(`created minio secret using context: ${context}`);
    }
  }

  private async prepareStreamUploaderSecrets(config: NetworkDeployConfigClass): Promise<void> {
    const namespace: NamespaceName = config.namespace;

    // Generating cloud storage secrets
    const {gcsWriteAccessKey, gcsWriteSecrets, gcsEndpoint, awsWriteAccessKey, awsWriteSecrets, awsEndpoint} = config;
    const cloudData: Record<string, string> = {};
    if (
      config.storageType === constants.StorageType.AWS_ONLY ||
      config.storageType === constants.StorageType.AWS_AND_GCS
    ) {
      cloudData['S3_ACCESS_KEY'] = Base64.encode(awsWriteAccessKey);
      cloudData['S3_SECRET_KEY'] = Base64.encode(awsWriteSecrets);
      cloudData['S3_ENDPOINT'] = Base64.encode(awsEndpoint);
    }
    if (
      config.storageType === constants.StorageType.GCS_ONLY ||
      config.storageType === constants.StorageType.AWS_AND_GCS
    ) {
      cloudData['GCS_ACCESS_KEY'] = Base64.encode(gcsWriteAccessKey);
      cloudData['GCS_SECRET_KEY'] = Base64.encode(gcsWriteSecrets);
      cloudData['GCS_ENDPOINT'] = Base64.encode(gcsEndpoint);
    }

    // create secret in each cluster
    for (const context of config.contexts) {
      this.logger.debug(
        `creating secret for storage credential of type '${config.storageType}' using context: ${context}`,
      );

      const isCloudSecretCreated: boolean = await this.k8Factory
        .getK8(context)
        .secrets()
        .createOrReplace(namespace, constants.UPLOADER_SECRET_NAME, SecretType.OPAQUE, cloudData);

      if (!isCloudSecretCreated) {
        throw new SoloError(
          `failed to create secret for storage credentials of type '${config.storageType}' using context: ${context}`,
        );
      }

      this.logger.debug(
        `created secret for storage credential of type '${config.storageType}' using context: ${context}`,
      );
    }
  }

  private async prepareBackupUploaderSecrets(config: NetworkDeployConfigClass): Promise<void> {
    const {backupWriteAccessKey, backupWriteSecrets, backupEndpoint, backupRegion} = config;
    const backupData: Record<string, string> = {};
    const namespace: NamespaceName = config.namespace;
    backupData['AWS_ACCESS_KEY_ID'] = Base64.encode(backupWriteAccessKey);
    backupData['AWS_SECRET_ACCESS_KEY'] = Base64.encode(backupWriteSecrets);
    backupData['RCLONE_CONFIG_BACKUPS_ENDPOINT'] = Base64.encode(backupEndpoint);
    backupData['RCLONE_CONFIG_BACKUPS_REGION'] = Base64.encode(backupRegion);
    backupData['RCLONE_CONFIG_BACKUPS_TYPE'] = Base64.encode('s3');
    backupData['RCLONE_CONFIG_BACKUPS_PROVIDER'] = Base64.encode('GCS');

    // create secret in each cluster
    for (const context of config.contexts) {
      this.logger.debug(`creating secret for backup uploader using context: ${context}`);

      const k8client: K8 = this.k8Factory.getK8(context);
      const isBackupSecretCreated: boolean = await k8client
        .secrets()
        .createOrReplace(namespace, constants.BACKUP_SECRET_NAME, SecretType.OPAQUE, backupData);

      if (!isBackupSecretCreated) {
        throw new SoloError(`failed to create secret for backup uploader using context: ${context}`);
      }

      this.logger.debug(`created secret for backup uploader using context: ${context}`);
    }
  }

  private async prepareStorageSecrets(config: NetworkDeployConfigClass): Promise<void> {
    try {
      if (config.storageType !== constants.StorageType.MINIO_ONLY) {
        const minioAccessKey: string = uuidv4();
        const minioSecretKey: string = uuidv4();
        await this.prepareMinioSecrets(config, minioAccessKey, minioSecretKey);
        await this.prepareStreamUploaderSecrets(config);
      }

      if (config.backupBucket) {
        await this.prepareBackupUploaderSecrets(config);
      }
    } catch (error) {
      throw new SoloError('Failed to create Kubernetes storage secret', error);
    }
  }

  /**
   * Prepare values args string for each cluster-ref
   * @param config
   */
  private async prepareValuesArgMap(config: NetworkDeployConfigClass): Promise<Record<ClusterReference, string>> {
    const valuesArguments: Record<ClusterReference, string> = this.prepareValuesArg(config);

    // prepare values files for each cluster
    const valuesArgumentMap: Record<ClusterReference, string> = {};
    const profileName: string = this.configManager.getFlag(flags.profileName);

    this.profileValuesFile = await this.profileManager.prepareValuesForSoloChart(
      profileName,
      config.consensusNodes,
      config.domainNamesMapping,
    );

    const valuesFiles: Record<ClusterReference, string> = BaseCommand.prepareValuesFilesMapMulticluster(
      config.clusterRefs,
      config.chartDirectory,
      this.profileValuesFile,
      config.valuesFile,
    );

    for (const clusterReference of Object.keys(valuesFiles)) {
      valuesArgumentMap[clusterReference] = valuesArguments[clusterReference] + valuesFiles[clusterReference];
      this.logger.debug(`Prepared helm chart values for cluster-ref: ${clusterReference}`, {
        valuesArg: valuesArgumentMap,
      });
    }

    return valuesArgumentMap;
  }

  /**
   * Prepare the values argument for the helm chart for a given config
   * @param config
   */
  private prepareValuesArg(config: NetworkDeployConfigClass): Record<ClusterReference, string> {
    const valuesArguments: Record<ClusterReference, string> = {};
    const clusterReferences: ClusterReference[] = [];
    let extraEnvironmentIndex: number = 0;

    // initialize the valueArgs
    for (const consensusNode of config.consensusNodes) {
      // add the cluster to the list of clusters
      if (!clusterReferences[consensusNode.cluster]) {
        clusterReferences.push(consensusNode.cluster);
      }

      // set the extraEnv settings on the nodes for running with a local build or tool
      if (config.app === constants.HEDERA_APP_NAME) {
        // make sure each cluster has an empty string for the valuesArg
        valuesArguments[consensusNode.cluster] = '';
      } else {
        extraEnvironmentIndex = 1; // used to add the debug options when using a tool or local build of hedera
        let valuesArgument: string = valuesArguments[consensusNode.cluster] ?? '';
        valuesArgument += ` --set "hedera.nodes[${consensusNode.nodeId}].root.extraEnv[0].name=JAVA_MAIN_CLASS"`;
        valuesArgument += ` --set "hedera.nodes[${consensusNode.nodeId}].root.extraEnv[0].value=com.swirlds.platform.Browser"`;
        valuesArguments[consensusNode.cluster] = valuesArgument;
      }
    }

    // add debug options to the debug node
    config.consensusNodes.filter(consensusNode => {
      if (consensusNode.name === config.debugNodeAlias) {
        valuesArguments[consensusNode.cluster] = addDebugOptions(
          valuesArguments[consensusNode.cluster],
          config.debugNodeAlias,
          extraEnvironmentIndex,
        );
      }
    });

    if (
      config.storageType === constants.StorageType.AWS_AND_GCS ||
      config.storageType === constants.StorageType.GCS_ONLY
    ) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set cloud.gcs.enabled=true';
      }
    }

    if (
      config.storageType === constants.StorageType.AWS_AND_GCS ||
      config.storageType === constants.StorageType.AWS_ONLY
    ) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set cloud.s3.enabled=true';
      }
    }

    if (
      config.storageType === constants.StorageType.GCS_ONLY ||
      config.storageType === constants.StorageType.AWS_ONLY ||
      config.storageType === constants.StorageType.AWS_AND_GCS
    ) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set cloud.minio.enabled=false';
      }
    }

    if (config.storageType !== constants.StorageType.MINIO_ONLY) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ' --set cloud.generateNewSecrets=false';
      }
    }

    if (config.gcsBucket) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ` --set cloud.buckets.streamBucket=${config.gcsBucket}` +
          ` --set minio-server.tenant.buckets[0].name=${config.gcsBucket}`;
      }
    }

    if (config.gcsBucketPrefix) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ` --set cloud.buckets.streamBucketPrefix=${config.gcsBucketPrefix}`;
      }
    }

    if (config.awsBucket) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ` --set cloud.buckets.streamBucket=${config.awsBucket}` +
          ` --set minio-server.tenant.buckets[0].name=${config.awsBucket}`;
      }
    }

    if (config.awsBucketPrefix) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] += ` --set cloud.buckets.streamBucketPrefix=${config.awsBucketPrefix}`;
      }
    }

    if (config.backupBucket) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ' --set defaults.sidecars.backupUploader.enabled=true' +
          ` --set defaults.sidecars.backupUploader.config.backupBucket=${config.backupBucket}`;
      }
    }

    for (const clusterReference of clusterReferences) {
      valuesArguments[clusterReference] +=
        ` --set "telemetry.prometheus.svcMonitor.enabled=${config.enablePrometheusSvcMonitor}"` +
        ` --set "defaults.volumeClaims.enabled=${config.persistentVolumeClaims}"`;
    }

    // Iterate over each node and set static IPs for HAProxy
    this.addArgForEachRecord(
      config.haproxyIpsParsed,
      config.consensusNodes,
      valuesArguments,
      ' --set "hedera.nodes[${nodeId}].haproxyStaticIP=${recordValue}"',
    );

    // Iterate over each node and set static IPs for Envoy Proxy
    this.addArgForEachRecord(
      config.envoyIpsParsed,
      config.consensusNodes,
      valuesArguments,
      ' --set "hedera.nodes[${nodeId}].envoyProxyStaticIP=${recordValue}"',
    );

    if (config.resolvedThrottlesFile) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ` --set-file "hedera.configMaps.genesisThrottlesJson=${config.resolvedThrottlesFile}"`;
      }
    }

    if (config.loadBalancerEnabled) {
      for (const clusterReference of clusterReferences) {
        valuesArguments[clusterReference] +=
          ' --set "defaults.haproxy.service.type=LoadBalancer"' +
          ' --set "defaults.envoyProxy.service.type=LoadBalancer"' +
          ' --set "defaults.consensus.service.type=LoadBalancer"';
      }
    }

    if (config.activeBlockNodeComponents.length > 0) {
      for (const clusterReference of clusterReferences) {
        const blockNodesJsonData: string = new BlockNodesJsonWrapper(
          config.activeBlockNodeComponents,
          this.remoteConfigManager.clusters,
        ).toJSON();

        const blockNodesJsonPath: string = PathEx.join(constants.SOLO_CACHE_DIR, 'block-nodes.json');
        fs.writeFileSync(blockNodesJsonPath, blockNodesJsonData);

        valuesArguments[clusterReference] += ` --set-file "hedera.configMaps.blockNodesJson=${blockNodesJsonPath}"`;
      }
    }

    return valuesArguments;
  }

  /**
   * Adds the template string to the argument for each record
   * @param records - the records to iterate over
   * @param consensusNodes - the consensus nodes to iterate over
   * @param valuesArguments - the values arguments to add to
   * @param templateString - the template string to add
   */
  private addArgForEachRecord(
    records: Record<NodeAlias, string>,
    consensusNodes: ConsensusNode[],
    valuesArguments: Record<ClusterReference, string>,
    templateString: string,
  ): void {
    if (records) {
      for (const consensusNode of consensusNodes) {
        if (records[consensusNode.name]) {
          const newTemplateString: string = templateString.replace('{nodeId}', consensusNode.nodeId.toString());
          valuesArguments[consensusNode.cluster] += newTemplateString.replace(
            '{recordValue}',
            records[consensusNode.name],
          );
        }
      }
    }
  }

  private async prepareNamespaces(config: NetworkDeployConfigClass): Promise<void> {
    const namespace: NamespaceName = config.namespace;

    // check and create namespace in each cluster
    for (const context of config.contexts) {
      const k8client: K8 = this.k8Factory.getK8(context);
      if (await k8client.namespaces().has(namespace)) {
        this.logger.debug(`namespace '${namespace}' found using context: ${context}`);
      } else {
        this.logger.debug(`creating namespace '${namespace}' using context: ${context}`);
        await k8client.namespaces().create(namespace);
        this.logger.debug(`created namespace '${namespace}' using context: ${context}`);
      }
    }
  }

  private async prepareConfig(
    task: SoloListrTaskWrapper<NetworkDeployContext>,
    argv: ArgvStruct,
  ): Promise<NetworkDeployConfigClass> {
    this.configManager.update(argv);
    this.logger.debug('Updated config with argv', {config: this.configManager.config});

    const flagsWithDisabledPrompts: CommandFlag[] = [
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
      flags.gcsWriteAccessKey,
      flags.gcsWriteSecrets,
      flags.gcsEndpoint,
      flags.gcsBucket,
      flags.gcsBucketPrefix,
      flags.nodeAliasesUnparsed,
      flags.domainNames,
    ];

    // disable the prompts that we don't want to prompt the user for
    flags.disablePrompts(flagsWithDisabledPrompts);

    const allFlags: CommandFlag[] = [
      ...NetworkCommand.DEPLOY_FLAGS_LIST.optional,
      ...NetworkCommand.DEPLOY_FLAGS_LIST.required,
    ];

    await this.configManager.executePrompt(task, allFlags);

    const namespace: NamespaceName = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
    this.configManager.setFlag(flags.namespace, namespace);

    // create a config object for subsequent steps
    const config: NetworkDeployConfigClass = this.configManager.getConfig(
      NetworkCommand.DEPLOY_CONFIGS_NAME,
      allFlags,
      [
        'keysDir',
        'nodeAliases',
        'stagingDir',
        'stagingKeysDir',
        'valuesArgMap',
        'resolvedThrottlesFile',
        'namespace',
        'consensusNodes',
        'contexts',
        'clusterRefs',
      ],
    ) as NetworkDeployConfigClass;

    if (config.haproxyIps) {
      config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
    }

    if (config.envoyIps) {
      config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
    }

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    // compute other config parameters
    config.keysDir = PathEx.join(config.cacheDir, 'keys');
    config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);
    config.stagingKeysDir = PathEx.join(config.stagingDir, 'keys');

    config.resolvedThrottlesFile = resolveValidJsonFilePath(
      config.genesisThrottlesFile,
      flags.genesisThrottlesFile.definition.defaultValue as string,
    );

    config.consensusNodes = this.remoteConfigManager.getConsensusNodes();
    config.contexts = this.remoteConfigManager.getContexts();
    config.clusterRefs = this.remoteConfigManager.getClusterRefs();
    config.nodeAliases = parseNodeAliases(config.nodeAliasesUnparsed, config.consensusNodes, this.configManager);
    argv[flags.nodeAliasesUnparsed.name] = config.nodeAliases.join(',');

    config.activeBlockNodeComponents = this.remoteConfigManager.components.getActiveComponents(
      ComponentTypes.BlockNode,
    );

    config.valuesArgMap = await this.prepareValuesArgMap(config);

    // need to prepare the namespaces before we can proceed
    config.namespace = namespace;
    await this.prepareNamespaces(config);

    // prepare staging keys directory
    if (!fs.existsSync(config.stagingKeysDir)) {
      fs.mkdirSync(config.stagingKeysDir, {recursive: true});
    }

    // create cached keys dir if it does not exist yet
    if (!fs.existsSync(config.keysDir)) {
      fs.mkdirSync(config.keysDir);
    }

    this.logger.debug('Preparing storage secrets');
    await this.prepareStorageSecrets(config);

    this.logger.debug('Prepared config', {
      config,
      cachedConfig: this.configManager.config,
    });
    return config;
  }

  private async destroyTask(
    context_: NetworkDestroyContext,
    task: SoloListrTaskWrapper<NetworkDestroyContext>,
  ): Promise<void> {
    task.title = `Uninstalling chart ${constants.SOLO_DEPLOYMENT_CHART}`;

    // Uninstall all 'solo deployment' charts for each cluster using the contexts
    await Promise.all(
      context_.config.contexts.map(context => {
        return this.chartManager.uninstall(
          context_.config.namespace,
          constants.SOLO_DEPLOYMENT_CHART,
          this.k8Factory.getK8(context).contexts().readCurrent(),
        );
      }),
    );

    // Delete Remote config inside each cluster
    task.title = `Deleting the RemoteConfig configmap in namespace ${context_.config.namespace}`;
    await Promise.all(
      context_.config.contexts.map(async context => {
        // Delete all if found
        await this.k8Factory
          .getK8(context)
          .configMaps()
          .delete(context_.config.namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);
      }),
    );

    // Delete PVCs inside each cluster
    if (context_.config.deletePvcs) {
      task.title = `Deleting PVCs in namespace ${context_.config.namespace}`;

      await Promise.all(
        context_.config.contexts.map(async context => {
          // Fetch all PVCs inside the namespace using the context
          const pvcs: string[] = await this.k8Factory.getK8(context).pvcs().list(context_.config.namespace, []);

          // Delete all if found
          return Promise.all(
            pvcs.map(pvc =>
              this.k8Factory
                .getK8(context)
                .pvcs()
                .delete(PvcReference.of(context_.config.namespace, PvcName.of(pvc))),
            ),
          );
        }),
      );
    }

    // Delete Secrets inside each cluster
    if (context_.config.deleteSecrets) {
      task.title = `Deleting secrets in namespace ${context_.config.namespace}`;

      await Promise.all(
        context_.config.contexts.map(async context => {
          // Fetch all Secrets inside the namespace using the context
          const secrets: {
            data: Record<string, string>;
            name: string;
            namespace: NamespaceNameAsString;
            type: string;
            labels: Record<string, string>;
          }[] = await this.k8Factory.getK8(context).secrets().list(context_.config.namespace);

          // Delete all if found
          return Promise.all(
            secrets.map(secret =>
              this.k8Factory.getK8(context).secrets().delete(context_.config.namespace, secret.name),
            ),
          );
        }),
      );
    }
  }

  /** Run helm install and deploy network components */
  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<NetworkDeployContext> = new Listr<NetworkDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
            context_.config = await this.prepareConfig(task, argv);
            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Copy gRPC TLS Certificates',
          task: (context_, parentTask): SoloListr<AnyListrContext> =>
            this.certificateManager.buildCopyTlsCertificatesTasks(
              parentTask,
              context_.config.grpcTlsCertificatePath,
              context_.config.grpcWebTlsCertificatePath,
              context_.config.grpcTlsKeyPath,
              context_.config.grpcWebTlsKeyPath,
            ),
          skip: (context_): boolean =>
            !context_.config.grpcTlsCertificatePath && !context_.config.grpcWebTlsCertificatePath,
        },
        {
          title: 'Check if cluster setup chart is installed',
          task: async (context_): Promise<void> => {
            for (const context of context_.config.contexts) {
              const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
                null,
                constants.SOLO_CLUSTER_SETUP_CHART,
                context,
              );
              if (!isChartInstalled) {
                throw new SoloError(
                  `Chart ${constants.SOLO_CLUSTER_SETUP_CHART} is not installed for cluster: ${context}. Run 'solo cluster-ref setup'`,
                );
              }
            }
          },
        },
        {
          title: 'Prepare staging directory',
          task: (_, parentTask): SoloListr<NetworkDeployContext> => {
            return parentTask.newListr(
              [
                {
                  title: 'Copy Gossip keys to staging',
                  task: (context_): void => {
                    const config: NetworkDeployConfigClass = context_.config;
                    this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, config.nodeAliases);
                  },
                },
                {
                  title: 'Copy gRPC TLS keys to staging',
                  task: (context_): void => {
                    const config: NetworkDeployConfigClass = context_.config;
                    for (const nodeAlias of config.nodeAliases) {
                      const tlsKeyFiles: PrivateKeyAndCertificateObject = this.keyManager.prepareTLSKeyFilePaths(
                        nodeAlias,
                        config.keysDir,
                      );

                      this.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir);
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
          task: (context_, parentTask): SoloListr<NetworkDeployContext> => {
            const config: NetworkDeployConfigClass = context_.config;

            // set up the subtasks
            return parentTask.newListr(
              this.platformInstaller.copyNodeKeys(config.stagingDir, config.consensusNodes, config.contexts),
              {
                concurrent: true,
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            );
          },
        },
        {
          title: `Install chart '${constants.SOLO_DEPLOYMENT_CHART}'`,
          task: async (context_): Promise<void> => {
            const config: NetworkDeployConfigClass = context_.config;
            for (const clusterReference of Object.keys(config.clusterRefs)) {
              if (
                await this.chartManager.isChartInstalled(
                  config.namespace,
                  constants.SOLO_DEPLOYMENT_CHART,
                  config.clusterRefs[clusterReference],
                )
              ) {
                await this.chartManager.uninstall(
                  config.namespace,
                  constants.SOLO_DEPLOYMENT_CHART,
                  config.clusterRefs[clusterReference],
                );
              }

              await this.chartManager.install(
                config.namespace,
                constants.SOLO_DEPLOYMENT_CHART,
                constants.SOLO_DEPLOYMENT_CHART,
                context_.config.chartDirectory ?? constants.SOLO_TESTING_CHART_URL,
                config.soloChartVersion,
                config.valuesArgMap[clusterReference],
                config.clusterRefs[clusterReference],
              );
              showVersionBanner(this.logger, SOLO_DEPLOYMENT_CHART, config.soloChartVersion);
            }
          },
        },
        // TODO: Move the check for load balancer logic to a utility method or class
        {
          title: 'Check for load balancer',
          skip: context_ => context_.config.loadBalancerEnabled === false,
          task: (context_, task): SoloListr<NetworkDeployContext> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            const config: NetworkDeployConfigClass = context_.config;

            //Add check for network node service to be created and load balancer to be assigned (if load balancer is enabled)
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Load balancer is assigned for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async (): Promise<void> => {
                  let attempts: number = 0;
                  let svc: Service[] | null = null;

                  while (attempts < constants.LOAD_BALANCER_CHECK_MAX_ATTEMPTS) {
                    svc = await this.k8Factory
                      .getK8(consensusNode.context)
                      .services()
                      .list(config.namespace, [
                        `solo.hedera.com/node-id=${consensusNode.nodeId},solo.hedera.com/type=network-node-svc`,
                      ]);

                    if (svc && svc.length > 0 && svc[0].status?.loadBalancer?.ingress?.length > 0) {
                      let shouldContinue: boolean = false;
                      for (let index: number = 0; index < svc[0].status.loadBalancer.ingress.length; index++) {
                        const ingress: LoadBalancerIngress = svc[0].status.loadBalancer.ingress[index];
                        if (!ingress.hostname && !ingress.ip) {
                          shouldContinue = true; // try again if there is neither a hostname nor an ip
                          break;
                        }
                      }
                      if (shouldContinue) {
                        continue;
                      }
                      return;
                    }

                    attempts++;
                    await sleep(Duration.ofSeconds(constants.LOAD_BALANCER_CHECK_DELAY_SECS));
                  }
                  throw new SoloError('Load balancer not found');
                },
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
        // TODO: find a better solution to avoid the need to redeploy the chart
        {
          title: 'Redeploy chart with external IP address config',
          skip: context_ => context_.config.loadBalancerEnabled === false,
          task: async (context_, task): Promise<SoloListr<NetworkDeployContext>> => {
            // Update the valuesArgMap with the external IP addresses
            // This regenerates the config.txt and genesis-network.json files with the external IP addresses
            context_.config.valuesArgMap = await this.prepareValuesArgMap(context_.config);

            // Perform a helm upgrade for each cluster
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            const config: NetworkDeployConfigClass = context_.config;
            for (const clusterReference of Object.keys(config.clusterRefs)) {
              subTasks.push({
                title: `Upgrade chart for cluster: ${chalk.yellow(clusterReference)}`,
                task: async (): Promise<void> => {
                  await this.chartManager.upgrade(
                    config.namespace,
                    constants.SOLO_DEPLOYMENT_CHART,
                    constants.SOLO_DEPLOYMENT_CHART,
                    context_.config.chartDirectory ?? constants.SOLO_TESTING_CHART_URL,
                    config.soloChartVersion,
                    config.valuesArgMap[clusterReference],
                    config.clusterRefs[clusterReference],
                  );
                  showVersionBanner(this.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion, 'Upgraded');

                  // TODO: Remove this code now that we have made the config dynamic and can update it without redeploying
                  const context: Context = config.clusterRefs[clusterReference];
                  const pods: Pod[] = await this.k8Factory
                    .getK8(context)
                    .pods()
                    .list(context_.config.namespace, ['solo.hedera.com/type=network-node']);

                  for (const pod of pods) {
                    const podReference: PodReference = pod.podReference;
                    await this.k8Factory.getK8(context).pods().readByReference(podReference).killPod();
                  }
                },
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
        this.waitForNetworkPods(),
        {
          title: 'Check proxy pods are running',
          task: (context_, task): SoloListr<NetworkDeployContext> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            const config: NetworkDeployConfigClass = context_.config;

            // HAProxy
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Check HAProxy for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async () =>
                  await this.k8Factory
                    .getK8(consensusNode.context)
                    .pods()
                    .waitForRunningPhase(
                      config.namespace,
                      ['solo.hedera.com/type=haproxy'],
                      constants.PODS_RUNNING_MAX_ATTEMPTS,
                      constants.PODS_RUNNING_DELAY,
                    ),
              });
            }

            // Envoy Proxy
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Check Envoy Proxy for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async () =>
                  await this.k8Factory
                    .getK8(consensusNode.context)
                    .pods()
                    .waitForRunningPhase(
                      context_.config.namespace,
                      ['solo.hedera.com/type=envoy-proxy'],
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
          task: (_, task): SoloListr<NetworkDeployContext> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];

            // minio
            subTasks.push({
              title: 'Check MinIO',
              task: async context_ => {
                for (const context of context_.config.contexts) {
                  await this.k8Factory
                    .getK8(context)
                    .pods()
                    .waitForReadyStatus(
                      context_.config.namespace,
                      ['v1.min.io/tenant=minio'],
                      constants.PODS_RUNNING_MAX_ATTEMPTS,
                      constants.PODS_RUNNING_DELAY,
                    );
                }
              },
              // skip if only cloud storage is/are used
              skip: context_ =>
                context_.config.storageType === constants.StorageType.GCS_ONLY ||
                context_.config.storageType === constants.StorageType.AWS_ONLY ||
                context_.config.storageType === constants.StorageType.AWS_AND_GCS,
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
    } catch (error) {
      throw new SoloError(`Error installing chart ${constants.SOLO_DEPLOYMENT_CHART}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    let networkDestroySuccess: boolean = true;
    const tasks: Listr<NetworkDestroyContext> = new Listr<NetworkDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<SoloListr<NetworkDeployContext>> => {
            if (!argv.force) {
              const confirmResult: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the network components?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            this.configManager.update(argv);
            await this.configManager.executePrompt(task, [flags.deletePvcs, flags.deleteSecrets]);

            context_.config = {
              deletePvcs: this.configManager.getFlag<boolean>(flags.deletePvcs) as boolean,
              deleteSecrets: this.configManager.getFlag<boolean>(flags.deleteSecrets) as boolean,
              deployment: this.configManager.getFlag<string>(flags.deployment) as string,
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              enableTimeout: this.configManager.getFlag<boolean>(flags.enableTimeout) as boolean,
              force: this.configManager.getFlag<boolean>(flags.force) as boolean,
              contexts: this.remoteConfigManager.getContexts(),
            };

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Remove deployment from local configuration',
          task: async (context_): Promise<void> => {
            await this.localConfig.modify(async localConfigData => {
              localConfigData.removeDeployment(context_.config.deployment);
            });
          },
        },
        {
          title: 'Running sub-tasks to destroy network',
          task: async (context_, task): Promise<void> => {
            if (context_.config.enableTimeout) {
              const timeoutId: NodeJS.Timeout = setTimeout(async () => {
                const message: string = `\n\nUnable to finish network destroy in ${constants.NETWORK_DESTROY_WAIT_TIMEOUT} seconds\n\n`;
                this.logger.error(message);
                this.logger.showUser(chalk.red(message));
                networkDestroySuccess = false;

                if (context_.config.deletePvcs && context_.config.deleteSecrets) {
                  await Promise.all(
                    context_.config.contexts.map(context =>
                      this.k8Factory.getK8(context).namespaces().delete(context_.config.namespace),
                    ),
                  );
                } else {
                  // If the namespace is not being deleted,
                  // remove all components data from the remote configuration
                  await this.remoteConfigManager.deleteComponents();
                }
              }, constants.NETWORK_DESTROY_WAIT_TIMEOUT * 1000);

              await this.destroyTask(context_, task);

              clearTimeout(timeoutId);
            } else {
              await this.destroyTask(context_, task);
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
    } catch (error) {
      throw new SoloError('Error destroying network', error);
    } finally {
      // If the namespace is deleted, the lease can't be released
      await lease.release().catch();
    }

    return networkDestroySuccess;
  }

  public getCommandDefinition(): CommandDefinition {
    const self: this = this;
    return {
      command: NetworkCommand.COMMAND_NAME,
      desc: 'Manage solo network deployment',
      builder: (yargs: AnyYargs): AnyYargs => {
        return yargs
          .command({
            command: 'deploy',
            desc: "Deploy solo network.  Requires the chart `solo-cluster-setup` to have been installed in the cluster.  If it hasn't the following command can be ran: `solo cluster-ref setup`",
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...NetworkCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              self.logger.info("==== Running 'network deploy' ===");
              self.logger.info(argv);

              await self
                .deploy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `network deploy`====');

                  if (!r) {
                    throw new SoloError('Error deploying network, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error deploying network: ${error.message}`, error);
                });
            },
          })
          .command({
            command: 'destroy',
            desc: 'Destroy solo network. If both --delete-pvcs and --delete-secrets are set to true, the namespace will be deleted.',
            builder: (y: AnyYargs) => {
              flags.setRequiredCommandFlags(y, ...NetworkCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...NetworkCommand.DESTROY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              self.logger.info("==== Running 'network destroy' ===");
              self.logger.info(argv);

              await self
                .destroy(argv)
                .then(r => {
                  self.logger.info('==== Finished running `network destroy`====');

                  if (!r) {
                    throw new SoloError('Error destroying network, expected return value to be true');
                  }
                })
                .catch(error => {
                  throw new SoloError(`Error destroying network: ${error.message}`, error);
                });
            },
          })
          .demandCommand(1, 'Select a chart command');
      },
    };
  }

  /** Adds the consensus node, envoy and haproxy components to remote config.  */
  public addNodesAndProxies(): SoloListrTask<NetworkDeployContext> {
    return {
      title: 'Add node and proxies to remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_): Promise<void> => {
        const {namespace} = context_.config;

        await this.remoteConfigManager.modify(async remoteConfig => {
          for (const consensusNode of context_.config.consensusNodes) {
            const nodeAlias: NodeAlias = consensusNode.name;
            const clusterReference: ClusterReference = consensusNode.cluster;

            remoteConfig.components.changeNodeState(nodeAlias, ConsensusNodeStates.REQUESTED);

            remoteConfig.components.addNewComponent(
              ComponentFactory.createNewEnvoyProxyComponent(
                this.remoteConfigManager,
                clusterReference,
                namespace,
                nodeAlias,
              ),
            );
            remoteConfig.components.addNewComponent(
              ComponentFactory.createNewHaProxyComponent(
                this.remoteConfigManager,
                clusterReference,
                namespace,
                nodeAlias,
              ),
            );
          }
        });
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
