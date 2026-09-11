// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import chalk from 'chalk';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {type PvcMountVerifier} from '../core/pvc-mount-verifier.js';
import {type PvcMountFinding} from '../core/pvc-mount-finding.js';
import {UserBreak} from '../core/errors/user-break.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import * as constants from '../core/constants.js';
import {DEFAULT_SOLO_NAMESPACE_LABELS, getEnvironmentVariable} from '../core/constants.js';
import {SharedClusterResourceReport} from '../core/shared-cluster-resource-report.js';
import {ClusterCrdProbe} from '../core/cluster-crd-probe.js';
import {Templates} from '../core/templates.js';
import {
  Helpers,
  createAndCopyBlockNodeJsonFileForConsensusNode,
  parseNodeAliases,
  resolveValidJsonFilePath,
  showVersionBanner,
  sleep,
} from '../core/helpers.js';
import {helmValuesHelper} from '../core/helm-values-helper.js';
import {HelmChartValues} from '../integration/helm/model/values.js';
import {type PerNodeIdentity} from '../types/helm-values.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import fs from 'node:fs';
import path from 'node:path';
import {type KeyManager} from '../core/key-manager.js';
import {type PlatformInstaller} from '../core/platform-installer.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type CertificateManager} from '../core/certificate-manager.js';
import {type AnyListrContext, type ArgvStruct, type NodeAlias} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {v4 as uuidv4} from 'uuid';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type ComponentId,
  type Context,
  type DeploymentName,
  type Realm,
  type Shard,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import {Base64} from 'js-base64';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {Duration} from '../core/time/duration.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {PathEx} from '../business/utils/path-ex.js';
import {FilePermissions} from '../business/utils/file-permissions.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type K8} from '../integration/kube/k8.js';
import {type Lock} from '../core/lock/lock.js';
import {type Container} from '../integration/kube/resources/container/container.js';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {ConsensusNode} from '../core/model/consensus-node.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import * as versions from '../../version.js';
import {K8Helper} from '../business/utils/k8-helper.js';
import {PackageDownloader} from '../core/package-downloader.js';
import {Zippy} from '../core/zippy.js';
import {type SoloEventBus} from '../core/events/solo-event-bus.js';
import {NetworkDeployedEvent} from '../core/events/event-types/network-deployed-event.js';
import {type Wraps} from '../business/runtime-state/config/solo/wraps.js';
import {type NetworkDeployConfigClass} from './network-deploy-config-class.js';
import {type NetworkDestroyContext} from './network-destroy-context.js';

export {type NetworkDeployConfigClass} from './network-deploy-config-class.js';
export {type NetworkDestroyContext} from './network-destroy-context.js';

interface NetworkDeployContext {
  config: NetworkDeployConfigClass;
}

@injectable()
export class NetworkCommand extends BaseCommand {
  private profileValuesFile?: Record<ClusterReferenceName, string>;

  public constructor(
    @inject(InjectTokens.CertificateManager) private readonly certificateManager: CertificateManager,
    @inject(InjectTokens.KeyManager) private readonly keyManager: KeyManager,
    @inject(InjectTokens.PlatformInstaller) private readonly platformInstaller: PlatformInstaller,
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
    @inject(InjectTokens.PackageDownloader) private readonly downloader: PackageDownloader,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
    @inject(InjectTokens.PvcMountVerifier) private readonly pvcMountVerifier: PvcMountVerifier,
  ) {
    super();

    this.certificateManager = patchInject(certificateManager, InjectTokens.CertificateManager, this.constructor.name);
    this.keyManager = patchInject(keyManager, InjectTokens.KeyManager, this.constructor.name);
    this.platformInstaller = patchInject(platformInstaller, InjectTokens.PlatformInstaller, this.constructor.name);
    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.zippy = patchInject(zippy, InjectTokens.Zippy, this.constructor.name);
    this.downloader = patchInject(downloader, InjectTokens.PackageDownloader, this.constructor.name);
    this.pvcMountVerifier = patchInject(pvcMountVerifier, InjectTokens.PvcMountVerifier, this.constructor.name);
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.deployment, flags.deletePvcs, flags.deleteSecrets, flags.enableTimeout, flags.force, flags.quiet],
  };

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.apiPermissionProperties,
      flags.app,
      flags.applicationEnv,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.genesisThrottlesFile,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.soloChartVersion,
      flags.debugNodeAlias,
      flags.loadBalancerEnabled,
      flags.log4j2Xml,
      flags.persistentVolumeClaims,
      flags.verifyPersistentVolumeClaimMounts,
      flags.quiet,
      // Keep the legacy flag visible in help as deprecated while canonical parsing
      // uses --consensus-node-version.
      flags.releaseTag,
      flags.consensusNodeVersion,
      flags.settingTxt,
      flags.networkDeploymentValuesFile,
      flags.nodeAliasesUnparsed,
      flags.grpcTlsCertificatePath,
      flags.grpcWebTlsCertificatePath,
      flags.grpcTlsKeyPath,
      flags.grpcWebTlsKeyPath,
      flags.haproxyIps,
      flags.envoyIps,
      flags.networkNodeIps,
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
      flags.awsBucketRegion,
      flags.awsBucketPrefix,
      flags.backupBucket,
      flags.backupWriteAccessKey,
      flags.backupWriteSecrets,
      flags.backupEndpoint,
      flags.backupRegion,
      flags.backupProvider,
      flags.domainNames,
      flags.gossipEndpointPort,
      flags.serviceEndpointPort,
      flags.serviceMonitor,
      flags.podLog,
      flags.enableMonitoringSupport,
      flags.clusterSetupNamespace,
      flags.javaFlightRecorderConfiguration,
      flags.wrapsEnabled,
      flags.wrapsKeyPath,
      flags.tssEnabled,
      flags.blockNodeMessageSizeSoftLimitBytes,
      flags.blockNodeMessageSizeHardLimitBytes,
    ],
  };

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
          concurrent: true,
          rendererOptions: {
            collapseSubtasks: false,
          },
        });
      },
    };
  }

  /**
   * Confirms each consensus node's persistent volume claims are mounted on the storage they asked
   * for. A claim can bind and mount successfully against a filesystem far too small to hold it —
   * directory-based provisioners do not enforce the requested size — so without this check a node
   * running on the wrong disk looks like a clean deployment until the disk fills up.
   *
   * Warns by default because a legitimately oversubscribed development cluster (kind, and any
   * single-disk setup) reports the same shortfall; `--verify-pvc-mounts` turns it into a failure for
   * clusters where the storage layout is expected to be correct.
   *
   * That flag also enables the chart's `volumeClaims.capacityCheck` init container, which fails the
   * pod before the consensus node starts. This task stays as the backstop that still reports when
   * the chart-side guard is unavailable — an older chart, or a values file that overrides it.
   */
  private verifyPersistentVolumeClaimMounts(): SoloListrTask<NetworkDeployContext> {
    return {
      title: 'Verify persistent volume claim mounts',
      skip: (context_): boolean => !context_.config.persistentVolumeClaims,
      task: async (context_, task): Promise<void> => {
        const config: NetworkDeployConfigClass = context_.config;
        const findings: PvcMountFinding[] = [];

        for (const context of config.contexts) {
          findings.push(
            ...(await this.pvcMountVerifier.verify(config.namespace, context, ['solo.hedera.com/type=network-node'])),
          );
        }

        if (findings.length === 0) {
          return;
        }

        const descriptions: string[] = findings.map(
          (finding: PvcMountFinding): string => `${finding.podName}: ${finding.description}`,
        );

        if (config.verifyPersistentVolumeClaimMounts) {
          throw new SoloErrors.system.pvcMountVerificationFailed(descriptions);
        }

        task.title = `${task.title} ${chalk.yellow(`[${findings.length} warning(s)]`)}`;
        this.logger.showUser(
          chalk.yellow(
            `Persistent volume claim mounts are smaller than requested (${findings.length} finding(s)); ` +
              'consensus nodes may run out of disk. Deploy with --verify-pvc-mounts to treat this as an error.',
          ),
        );
        for (const description of descriptions) {
          this.logger.showUser(chalk.yellow(`  - ${description}`));
        }
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
        throw new SoloErrors.system.k8sSecretCreateFailed(
          `failed to create new minio secret using context: ${context}`,
        );
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
        throw new SoloErrors.system.k8sSecretCreateFailed(
          `failed to create secret for storage credentials of type '${config.storageType}' using context: ${context}`,
        );
      }

      this.logger.debug(
        `created secret for storage credential of type '${config.storageType}' using context: ${context}`,
      );
    }
  }

  private async prepareBackupUploaderSecrets(config: NetworkDeployConfigClass): Promise<void> {
    const {backupWriteAccessKey, backupWriteSecrets, backupEndpoint, backupRegion, backupProvider} = config;
    const backupData: Record<string, string> = {};
    const namespace: NamespaceName = config.namespace;
    backupData['AWS_ACCESS_KEY_ID'] = Base64.encode(backupWriteAccessKey);
    backupData['AWS_SECRET_ACCESS_KEY'] = Base64.encode(backupWriteSecrets);
    backupData['RCLONE_CONFIG_BACKUPS_ENDPOINT'] = Base64.encode(backupEndpoint);
    backupData['RCLONE_CONFIG_BACKUPS_REGION'] = Base64.encode(backupRegion);
    backupData['RCLONE_CONFIG_BACKUPS_TYPE'] = Base64.encode('s3');
    backupData['RCLONE_CONFIG_BACKUPS_PROVIDER'] = Base64.encode(backupProvider);

    // create secret in each cluster
    for (const context of config.contexts) {
      this.logger.debug(`creating secret for backup uploader using context: ${context}`);

      const k8client: K8 = this.k8Factory.getK8(context);
      const isBackupSecretCreated: boolean = await k8client
        .secrets()
        .createOrReplace(namespace, constants.BACKUP_SECRET_NAME, SecretType.OPAQUE, backupData);

      if (!isBackupSecretCreated) {
        throw new SoloErrors.system.k8sSecretCreateFailed(
          `failed to create secret for backup uploader using context: ${context}`,
        );
      }

      this.logger.debug(`created secret for backup uploader using context: ${context}`);
    }
  }

  private async prepareStorageSecrets(config: NetworkDeployConfigClass): Promise<void> {
    try {
      if (config.storageType !== constants.StorageType.MINIO_ONLY) {
        if (config.minioEnabled) {
          const minioAccessKey: string = uuidv4();
          const minioSecretKey: string = uuidv4();
          await this.prepareMinioSecrets(config, minioAccessKey, minioSecretKey);
        } else {
          this.logger.debug(`Skipping MinIO secret preparation for consensus node ${config.releaseTag}`);
        }

        await this.prepareStreamUploaderSecrets(config);
      } else if (!config.minioEnabled) {
        // Mirror importer references this secret even in block-node mode.
        // Create it explicitly when MinIO is disabled for CN >= 0.74.x.
        await this.prepareStreamUploaderSecrets(config);
      }

      if (config.backupBucket) {
        await this.prepareBackupUploaderSecrets(config);
      }
    } catch (error) {
      throw new SoloErrors.system.k8sSecretCreateFailed('Failed to create Kubernetes storage secret', error);
    }
  }

  /**
   * Prepare values args string for each cluster-ref
   * @param config
   */
  /**
   * Prepare Helm chart values for each cluster-ref
   * @param config
   */
  private async prepareHelmChartValuesMap(
    config: NetworkDeployConfigClass,
  ): Promise<Record<ClusterReferenceName, HelmChartValues>> {
    const clusterChartValues: Record<ClusterReferenceName, HelmChartValues> = this.prepareHelmChartValues(config);

    // prepare values files for each cluster
    const chartValuesMap: Record<ClusterReferenceName, HelmChartValues> = {};
    const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
    const applicationPropertiesPath: string = PathEx.joinWithRealPath(
      config.cacheDir,
      'templates',
      constants.APPLICATION_PROPERTIES,
    );

    const jfrFilePath: string = config.javaFlightRecorderConfiguration;
    const jfrFile: string =
      jfrFilePath === '' ? '' : jfrFilePath.slice(Math.max(0, jfrFilePath.lastIndexOf(path.sep) + 1));
    this.profileValuesFile = await this.profileManager.prepareValuesForSoloChart(
      config.consensusNodes,
      deploymentName,
      applicationPropertiesPath,
      jfrFile,
      {
        // Pass command-scoped values explicitly so profile/staging generation is isolated
        // from mutable global flags when one-shot runs parallel subcommands.
        cacheDir: config.cacheDir,
        releaseTag: config.releaseTag,
        appName: config.app,
        chainId: config.chainId,
      },
    );

    const preparedValuesFiles: {
      chartValuesMap: Record<ClusterReferenceName, HelmChartValues>;
      valueFilePathsMap: Record<ClusterReferenceName, string[]>;
    } = this.prepareHelmChartValuesFilesMap(
      config.clusterRefs,
      config.chartDirectory,
      this.profileValuesFile,
      config.valuesFile,
      [constants.SOLO_DEPLOYMENT_VALUES_FILE],
    );
    const valuesFiles: Record<ClusterReferenceName, HelmChartValues> = preparedValuesFiles.chartValuesMap;
    const valueFilePathsMap: Record<ClusterReferenceName, string[]> = preparedValuesFiles.valueFilePathsMap;

    // Generate per-cluster extraEnv values files to avoid passing the global node list to every
    // cluster's Helm upgrade (in multi-cluster deployments each cluster has its own node subset).
    // Each file carries only the nodes that belong to the target cluster, preventing Helm's
    // array-replacement semantics from inserting nodes from other clusters.
    const perClusterExtraEnvironmentValuesFiles: Record<ClusterReferenceName, string> = {};
    const needsExtraEnvironment: boolean =
      config.wrapsEnabled || !!config.debugNodeAlias || config.app !== constants.HEDERA_APP_NAME; // JAVA_MAIN_CLASS for tools/local builds

    if (needsExtraEnvironment) {
      const realm: Realm = this.localConfig.configuration.realmForDeployment(config.deployment);
      const shard: Shard = this.localConfig.configuration.shardForDeployment(config.deployment);

      for (const clusterReference of Object.keys(valuesFiles)) {
        // Only include nodes belonging to this cluster so the generated hedera.nodes array
        // matches the cluster-specific node set and does not overwrite nodes in other clusters.
        // Sort deterministically by nodeId so per-node Helm values align with the chart's
        // expected node ordering regardless of upstream object iteration order.
        const clusterConsensusNodes: ConsensusNode[] = config.consensusNodes
          .filter((node): boolean => node.cluster === clusterReference)
          // eslint-disable-next-line unicorn/no-array-sort
          .sort((left, right): number => left.nodeId - right.nodeId);
        if (clusterConsensusNodes.length === 0) {
          continue;
        }

        const additionalNodeValues: Record<
          NodeAlias,
          {name: NodeAlias; nodeId: number; accountId: string; blockNodesJson?: string}
        > = {};

        // Preserve blockNodesJson from the per-cluster profile values file so that it is not
        // silently dropped when the extraEnv values file replaces the hedera.nodes array.
        const clusterProfileValuesFile: string | undefined = this.profileValuesFile?.[clusterReference];
        const nodeIdentityMap: Record<NodeAlias, PerNodeIdentity> = clusterProfileValuesFile
          ? helmValuesHelper.extractPerNodeIdentityFromValuesFile(clusterProfileValuesFile, clusterConsensusNodes)
          : {};
        const blockNodesJsonMap: Record<NodeAlias, string> = clusterProfileValuesFile
          ? helmValuesHelper.extractPerNodeBlockNodesJsonFromValuesFile(clusterProfileValuesFile, clusterConsensusNodes)
          : {};

        for (const consensusNode of clusterConsensusNodes) {
          const identity: PerNodeIdentity = nodeIdentityMap[consensusNode.name] ?? {};
          additionalNodeValues[consensusNode.name] = {
            name: identity.name ?? consensusNode.name,
            nodeId: identity.nodeId ?? consensusNode.nodeId,
            // Prefer the accountId recorded in the profile values file (set by the account
            // manager using the deployment's configured start account ID) over the computed
            // default, so custom account IDs assigned via node transactions are preserved.
            accountId:
              identity.accountId ?? `${shard}.${realm}.${constants.DEFAULT_START_ID_NUMBER + consensusNode.nodeId}`,
          };
          if (blockNodesJsonMap[consensusNode.name]) {
            additionalNodeValues[consensusNode.name].blockNodesJson = blockNodesJsonMap[consensusNode.name];
          }
        }

        // Collect extraEnv entries already present in this cluster's values files so that the
        // generated file can include them and avoid Helm array replacement silently dropping
        // env vars set by user-provided values files.
        const existingValuesFilePaths: string[] = valueFilePathsMap[clusterReference] ?? [];
        const userValueFilePaths: string[] = valuesFiles[clusterReference]?.userValueFilePaths() ?? [];
        const extraEnvironmentWarnings: string[] = helmValuesHelper.describeUserProvidedExtraEnvironmentWarnings(
          userValueFilePaths,
          clusterConsensusNodes,
          {
            wrapsEnabled: config.wrapsEnabled,
            tss: this.soloConfig.tss,
            debugNodeAlias: config.debugNodeAlias,
            useJavaMainClass: config.app !== constants.HEDERA_APP_NAME,
          },
        );
        for (const warning of extraEnvironmentWarnings) {
          this.logger.showUserUnlessOneShot(chalk.yellow(warning));
        }

        const clusterExtraEnvironmentValuesFile: string = helmValuesHelper.generateExtraEnvironmentValuesFile(
          clusterConsensusNodes,
          {
            wrapsEnabled: config.wrapsEnabled,
            tss: this.soloConfig.tss,
            debugNodeAlias: config.debugNodeAlias,
            useJavaMainClass: config.app !== constants.HEDERA_APP_NAME,
            additionalNodeValues,
            baseExtraEnvironmentVariables: helmValuesHelper.extractExtraEnvironmentFromValuesFiles(
              existingValuesFilePaths,
              clusterConsensusNodes,
            ),
          },
          config.cacheDir,
        );

        perClusterExtraEnvironmentValuesFiles[clusterReference] = clusterExtraEnvironmentValuesFile;
        this.logger.debug(
          `Created per-cluster extraEnv values file for ${clusterReference}: ${clusterExtraEnvironmentValuesFile}`,
        );
      }
    }

    for (const clusterReference of Object.keys(valuesFiles)) {
      // Keep --set flags last so they override values files. This is critical when we also
      // provide per-node extraEnv via a values file (e.g. --debug-node-alias), because a later
      // values file can replace array elements and drop fields like node labels/account IDs.
      const chartValues: HelmChartValues = valuesFiles[clusterReference].clone();

      chartValues.add(clusterChartValues[clusterReference] ?? new HelmChartValues());

      // Add per-cluster extraEnv values file last (after user files) so that Solo-injected
      // env vars like TSS_LIB_WRAPS_ARTIFACTS_PATH are not wiped out by a user-provided
      // values file that also defines hedera.nodes[*].root.extraEnv. The generated file
      // already contains the user's extraEnv entries merged in via baseExtraEnvironmentVariables,
      // so placing it last is safe.
      if (perClusterExtraEnvironmentValuesFiles[clusterReference]) {
        chartValues.userFile(perClusterExtraEnvironmentValuesFiles[clusterReference]);
      }

      chartValuesMap[clusterReference] = chartValues;
      this.logger.debug(`Prepared helm chart values for cluster-ref: ${clusterReference}`, {
        valueArguments: chartValuesMap[clusterReference].toArguments(),
      });
    }

    return chartValuesMap;
  }

  /**
   * Prepare the Helm chart values for a given config
   * @param config
   */
  private prepareHelmChartValues(config: NetworkDeployConfigClass): Record<ClusterReferenceName, HelmChartValues> {
    const chartValuesMap: Record<ClusterReferenceName, HelmChartValues> = {};
    const clusterReferences: ClusterReferenceName[] = [];

    // initialize the chart values
    for (const consensusNode of config.consensusNodes) {
      // add the cluster to the list of clusters
      if (!clusterReferences.includes(consensusNode.cluster)) {
        clusterReferences.push(consensusNode.cluster);
      }

      // Initialize empty chart values for each cluster
      // All extraEnv logic (JAVA_MAIN_CLASS, TSS wraps, debug) is now handled via values files
      if (!chartValuesMap[consensusNode.cluster]) {
        chartValuesMap[consensusNode.cluster] = new HelmChartValues();
      }
    }

    // All extraEnv customizations (wraps, debug, JAVA_MAIN_CLASS) are handled
    // via generateExtraEnvironmentValuesFile() in prepareHelmChartValuesMap() to avoid Helm --set replacement issues

    if (
      config.storageType === constants.StorageType.AWS_AND_GCS ||
      config.storageType === constants.StorageType.GCS_ONLY
    ) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].set('cloud.gcs.enabled', true);
      }
    }

    if (
      config.storageType === constants.StorageType.AWS_AND_GCS ||
      config.storageType === constants.StorageType.AWS_ONLY
    ) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].set('cloud.s3.enabled', true);
      }
    }

    if (
      [constants.StorageType.GCS_ONLY, constants.StorageType.AWS_ONLY, constants.StorageType.AWS_AND_GCS].includes(
        config.storageType,
      )
    ) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].set('cloud.minio.enabled', false);
      }
    }

    if (config.storageType !== constants.StorageType.MINIO_ONLY) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].set('cloud.generateNewSecrets', false);
      }
    }

    if (config.minioEnabled && config.storageType === constants.StorageType.MINIO_ONLY) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].set('cloud.minio.enabled', true);
        chartValuesMap[clusterReference].set('cloud.generateNewSecrets', true);
      }
    } else if (!config.minioEnabled) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].set('cloud.minio.enabled', false);
        chartValuesMap[clusterReference].set('cloud.generateNewSecrets', false);
        chartValuesMap[clusterReference].set('defaults.sidecars.recordStreamUploader.enabled', false);
        chartValuesMap[clusterReference].set('defaults.sidecars.eventStreamUploader.enabled', false);
        chartValuesMap[clusterReference].set('defaults.sidecars.blockstreamUploader.enabled', false);
      }
    }

    if (config.gcsBucket) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference]
          .setLiteral('cloud.buckets.streamBucket', config.gcsBucket)
          .setLiteral('minio-server.tenant.buckets[0].name', config.gcsBucket);
      }
    }

    if (config.gcsBucketPrefix) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].setLiteral('cloud.buckets.streamBucketPrefix', config.gcsBucketPrefix);
      }
    }

    if (config.awsBucket) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference]
          .setLiteral('cloud.buckets.streamBucket', config.awsBucket)
          .setLiteral('minio-server.tenant.buckets[0].name', config.awsBucket);
      }
    }

    if (config.awsBucketPrefix) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].setLiteral('cloud.buckets.streamBucketPrefix', config.awsBucketPrefix);
      }
    }

    if (config.awsBucketRegion) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].setLiteral('cloud.buckets.streamBucketRegion', config.awsBucketRegion);
      }
    }

    if (config.backupBucket) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference]
          .set('defaults.sidecars.backupUploader.enabled', true)
          .setLiteral('defaults.sidecars.backupUploader.config.backupBucket', config.backupBucket);
      }
    }

    const nodeIndexByClusterAndName: Map<string, number> = new Map();
    const nextNodeIndexByCluster: Map<ClusterReferenceName, number> = new Map();
    for (const consensusNode of config.consensusNodes) {
      const nodeIndex: number = nextNodeIndexByCluster.get(consensusNode.cluster) ?? 0;
      nextNodeIndexByCluster.set(consensusNode.cluster, nodeIndex + 1);
      nodeIndexByClusterAndName.set(`${consensusNode.cluster}:${consensusNode.name}`, nodeIndex);
    }

    for (const consensusNode of config.consensusNodes) {
      const nodeIndex: number | undefined = nodeIndexByClusterAndName.get(
        `${consensusNode.cluster}:${consensusNode.name}`,
      );
      if (nodeIndex === undefined) {
        continue;
      }

      const nodePath: string = `hedera.nodes[${nodeIndex}]`;
      chartValuesMap[consensusNode.cluster].setLiteral(`${nodePath}.name`, consensusNode.name);
    }

    for (const clusterReference of clusterReferences) {
      chartValuesMap[clusterReference]
        .set('telemetry.prometheus.svcMonitor.enabled', false) // remove after chart version is bumped
        .set('crds.serviceMonitor.enabled', config.singleUseServiceMonitor)
        .set('crds.podLog.enabled', config.singleUsePodLog)
        .set('defaults.volumeClaims.enabled', config.persistentVolumeClaims)
        // Turn on the chart's own pre-start capacity guard alongside solo's post-deploy check, so
        // an undersized volume stops the node before it writes state rather than after.
        .set('defaults.volumeClaims.capacityCheck.enabled', config.verifyPersistentVolumeClaimMounts);
    }

    config.singleUseServiceMonitor = 'false';
    config.singleUsePodLog = 'false';

    // Iterate over each node and set static IPs for HAProxy
    this.addValueForEachRecord(config.haproxyIpsParsed, config.consensusNodes, chartValuesMap, 'haproxyStaticIP');

    // Iterate over each node and set static IPs for Envoy Proxy
    this.addValueForEachRecord(config.envoyIpsParsed, config.consensusNodes, chartValuesMap, 'envoyProxyStaticIP');

    // Iterate over each node and set static IPs for consensus node services
    this.addValueForEachRecord(
      config.networkNodeIpsParsed,
      config.consensusNodes,
      chartValuesMap,
      'networkNodeStaticIP',
    );

    if (config.resolvedThrottlesFile) {
      // repairing the path, this avoid helm failing when running on windows
      const throttlesFilePath: string = config.resolvedThrottlesFile.replaceAll('\\', '/');

      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference].setFile('hedera.configMaps.genesisThrottlesJson', throttlesFilePath);
      }
    }

    if (config.loadBalancerEnabled) {
      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference]
          .setLiteral('defaults.haproxy.service.type', 'LoadBalancer')
          .setLiteral('defaults.envoyProxy.service.type', 'LoadBalancer')
          .setLiteral('defaults.consensus.service.type', 'LoadBalancer');
      }
    }

    if (config.enableMonitoringSupport) {
      // the Prometheus stack is installed by `cluster-ref setup` into the cluster setup namespace,
      // which is configurable, so the Alloy sidecar's remote-write target is composed rather than
      // defaulted in the chart
      const remoteWriteEndpoint: string =
        `http://${constants.PROMETHEUS_RELEASE_NAME}-prometheus.${config.clusterSetupNamespace.name}` +
        '.svc:9090/api/v1/write';

      for (const clusterReference of clusterReferences) {
        chartValuesMap[clusterReference]
          .set('crs.podLog.enabled', true)
          .set('crs.serviceMonitor.enabled', true)
          .set('defaults.sidecars.grafanaAlloy.enabled', true)
          .setLiteral('defaults.sidecars.grafanaAlloy.remoteWrite.endpoint', remoteWriteEndpoint);
      }
    }

    return chartValuesMap;
  }

  /**
   * Adds the value for each record
   * @param records - the records to iterate over
   * @param consensusNodes - the consensus nodes to iterate over
   * @param chartValuesMap - the chart values to add to
   * @param valueName - the value name to add
   */
  private addValueForEachRecord(
    records: Record<NodeAlias, string>,
    consensusNodes: ConsensusNode[],
    chartValuesMap: Record<ClusterReferenceName, HelmChartValues>,
    valueName: string,
  ): void {
    if (records) {
      const nodeIndexByClusterAndName: Map<string, number> = new Map();
      const nextNodeIndexByCluster: Map<ClusterReferenceName, number> = new Map();

      for (const consensusNode of consensusNodes) {
        const nodeIndex: number = nextNodeIndexByCluster.get(consensusNode.cluster) ?? 0;
        nextNodeIndexByCluster.set(consensusNode.cluster, nodeIndex + 1);
        nodeIndexByClusterAndName.set(`${consensusNode.cluster}:${consensusNode.name}`, nodeIndex);
      }

      for (const consensusNode of consensusNodes) {
        const recordValue: string | undefined = records[consensusNode.name];
        if (!recordValue) {
          continue;
        }

        const nodeIndex: number | undefined = nodeIndexByClusterAndName.get(
          `${consensusNode.cluster}:${consensusNode.name}`,
        );
        if (nodeIndex === undefined) {
          continue;
        }

        chartValuesMap[consensusNode.cluster].setLiteral(`hedera.nodes[${nodeIndex}].${valueName}`, recordValue);
      }
    }
  }

  /**
   * Prepare the values files map for each cluster
   *
   * Order of precedence:
   * 1. Chart's default values file (if chartDirectory is set)
   * 2. Base values files (applied after chart defaults, before the generated profile values file)
   * 3. Profile values file
   * 4. User's values file
   * @param clusterReferences
   * @param chartDirectory - the chart directory
   * @param profileValuesFile - mapping of clusterRef to the profile values file full path
   * @param valuesFileInput - the values file input string
   * @param baseValuesFiles - optional list of values file paths inserted between chart defaults and profile values
   */
  private prepareHelmChartValuesFilesMap(
    clusterReferences: ClusterReferences,
    chartDirectory?: string,
    profileValuesFile?: Record<ClusterReferenceName, string>,
    valuesFileInput?: string,
    baseValuesFiles?: string[],
  ): {
    chartValuesMap: Record<ClusterReferenceName, HelmChartValues>;
    valueFilePathsMap: Record<ClusterReferenceName, string[]>;
  } {
    // initialize the map with an empty array for each cluster-ref
    const chartValuesMap: Record<string, HelmChartValues> = {[flags.KEY_COMMON]: new HelmChartValues()};
    const valueFilePathsMap: Record<string, string[]> = {[flags.KEY_COMMON]: []};
    for (const [clusterReference] of clusterReferences) {
      chartValuesMap[clusterReference] = new HelmChartValues();
      valueFilePathsMap[clusterReference] = [];
    }

    // add the chart's default values file for each cluster-ref if chartDirectory is set
    // this should be the first in the list of values files as it will be overridden by user's input
    if (chartDirectory) {
      const chartValuesFile: string = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
      for (const clusterReference in chartValuesMap) {
        HelmChartValues.addFileForCluster(chartValuesMap, valueFilePathsMap, clusterReference, chartValuesFile);
      }
    }

    // add base values files (e.g. component defaults) after chart defaults but before profile values
    if (baseValuesFiles) {
      for (const file of baseValuesFiles) {
        for (const clusterReference in chartValuesMap) {
          HelmChartValues.addFileForCluster(chartValuesMap, valueFilePathsMap, clusterReference, file);
        }
      }
    }

    if (profileValuesFile) {
      for (const [clusterReference, file] of Object.entries(profileValuesFile)) {
        if (clusterReference === flags.KEY_COMMON) {
          for (const clusterReference_ of Object.keys(chartValuesMap)) {
            HelmChartValues.addFileForCluster(chartValuesMap, valueFilePathsMap, clusterReference_, file);
          }
        } else {
          HelmChartValues.addFileForCluster(chartValuesMap, valueFilePathsMap, clusterReference, file);
        }
      }
    }

    if (valuesFileInput) {
      const parsed: Record<string, string[]> = flags.parseValuesFilesInput(valuesFileInput);
      for (const [clusterReference, files] of Object.entries(parsed)) {
        if (clusterReference === flags.KEY_COMMON) {
          for (const clusterReference_ of Object.keys(chartValuesMap)) {
            for (const file of files) {
              HelmChartValues.addUserFileForCluster(chartValuesMap, valueFilePathsMap, clusterReference_, file);
            }
          }
        } else {
          for (const file of files) {
            HelmChartValues.addUserFileForCluster(chartValuesMap, valueFilePathsMap, clusterReference, file);
          }
        }
      }
    }

    if (Object.keys(chartValuesMap).length > 1) {
      // delete the common key if there is another cluster to use
      delete chartValuesMap[flags.KEY_COMMON];
      delete valueFilePathsMap[flags.KEY_COMMON];
    }

    return {
      chartValuesMap: chartValuesMap as Record<ClusterReferenceName, HelmChartValues>,
      valueFilePathsMap: valueFilePathsMap as Record<ClusterReferenceName, string[]>,
    };
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
        await k8client.namespaces().create(namespace, DEFAULT_SOLO_NAMESPACE_LABELS);
        this.logger.debug(`created namespace '${namespace}' using context: ${context}`);
      }
    }
  }

  private async prepareConfig(
    task: SoloListrTaskWrapper<NetworkDeployContext>,
    argv: ArgvStruct,
  ): Promise<NetworkDeployConfigClass> {
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
      flags.verifyPersistentVolumeClaimMounts,
      flags.settingTxt,
      flags.grpcTlsCertificatePath,
      flags.grpcWebTlsCertificatePath,
      flags.grpcTlsKeyPath,
      flags.grpcWebTlsKeyPath,
      flags.haproxyIps,
      flags.envoyIps,
      flags.networkNodeIps,
      flags.storageType,
      flags.gcsWriteAccessKey,
      flags.gcsWriteSecrets,
      flags.gcsEndpoint,
      flags.gcsBucket,
      flags.gcsBucketPrefix,
      flags.nodeAliasesUnparsed,
      flags.domainNames,
      flags.gossipEndpointPort,
      flags.serviceEndpointPort,
    ];

    // disable the prompts that we don't want to prompt the user for
    flags.disablePrompts(flagsWithDisabledPrompts);

    const allFlags: CommandFlag[] = [
      ...NetworkCommand.DEPLOY_FLAGS_LIST.optional,
      ...NetworkCommand.DEPLOY_FLAGS_LIST.required,
    ];

    await this.configManager.executePrompt(task, allFlags);
    const namespace: NamespaceName =
      (await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task)) ??
      NamespaceName.of(this.configManager.getFlag(flags.deployment));

    this.configManager.setFlag(flags.namespace, namespace);

    // create a config object for subsequent steps
    const config: NetworkDeployConfigClass = this.configManager.getConfig(
      NetworkCommand.DEPLOY_CONFIGS_NAME,
      allFlags,
      [
        'keysDir',
        'nodeAliases',
        'stagingDir',
        'chartValuesMap',
        'resolvedThrottlesFile',
        'namespace',
        'consensusNodes',
        'contexts',
        'clusterRefs',
        'singleUsePodLog',
        'singleUseServiceMonitor',
      ],
    ) as NetworkDeployConfigClass;

    if (config.verifyPersistentVolumeClaimMounts && !config.persistentVolumeClaims) {
      throw new SoloErrors.validation.invalidFlagValue(
        flags.verifyPersistentVolumeClaimMounts.name,
        'true',
        `requires --${flags.persistentVolumeClaims.name}`,
      );
    }

    const normalizedReleaseTag: string | undefined = SemanticVersion.normalizeToken(config.releaseTag);
    if (normalizedReleaseTag) {
      config.releaseTag = normalizedReleaseTag;
    }

    if (config.haproxyIps) {
      config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
    }

    if (config.envoyIps) {
      config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
    }

    if (config.networkNodeIps) {
      config.networkNodeIpsParsed = Templates.parseNodeAliasToIpMapping(config.networkNodeIps);
    }

    if (config.domainNames) {
      config.domainNamesMapping = Templates.parseNodeAliasToDomainNameMapping(config.domainNames);
    }

    config.gossipEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.gossipEndpointPort);
    config.serviceEndpointPortMapping = Templates.parseNodeAliasToPortMapping(config.serviceEndpointPort);

    // compute other config parameters
    config.keysDir = PathEx.join(config.cacheDir, 'keys');
    config.stagingDir = Templates.renderStagingDir(config.cacheDir, config.releaseTag);

    config.resolvedThrottlesFile = resolveValidJsonFilePath(
      config.genesisThrottlesFile,
      flags.genesisThrottlesFile.definition.defaultValue as string,
    );

    config.consensusNodes = this.remoteConfig.getConsensusNodes();
    config.contexts = this.remoteConfig.getContexts();
    config.clusterRefs = this.remoteConfig.getClusterRefs();
    config.nodeAliases = parseNodeAliases(config.nodeAliasesUnparsed, config.consensusNodes, this.configManager);
    argv[flags.nodeAliasesUnparsed.name] = config.nodeAliases.join(',');

    config.blockNodeComponents = this.getBlockNodes();
    config.javaFlightRecorderConfiguration = this.configManager.getFlag(flags.javaFlightRecorderConfiguration);
    if (config.javaFlightRecorderConfiguration === '') {
      config.javaFlightRecorderConfiguration = getEnvironmentVariable('JAVA_FLIGHT_RECORDER_CONFIGURATION') || '';
    }

    config.singleUseServiceMonitor = config.serviceMonitor;
    config.singleUsePodLog = config.podLog;
    const networkNodeVersion: SemanticVersion<string> = new SemanticVersion(config.releaseTag);
    const tssByDefaultSupported: boolean = networkNodeVersion.greaterThanOrEqual(
      versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS,
    );
    const blockNodeConfigured: boolean =
      config.blockNodeComponents.length > 0 ||
      config.consensusNodes.some((consensusNode): boolean => {
        const blockNodeMapLength: number = consensusNode.blockNodeMap?.length ?? 0;
        const externalBlockNodeMapLength: number = consensusNode.externalBlockNodeMap?.length ?? 0;

        return blockNodeMapLength > 0 || externalBlockNodeMapLength > 0;
      });
    const blockStreamMode: string = Helpers.getBlockStreamModeForConsensusVersion(
      config.releaseTag,
      blockNodeConfigured,
      config.tssEnabled,
    );
    // CN >= 0.74 can stream blocks directly to a block node. If the effective stream
    // mode is forced back to BOTH/RECORDS for compatibility, keep MinIO enabled so
    // record uploaders and mirror importer use the same source.
    config.minioEnabled = !(
      tssByDefaultSupported &&
      config.tssEnabled &&
      blockNodeConfigured &&
      blockStreamMode === 'BLOCKS'
    );

    config.chartValuesMap = await this.prepareHelmChartValuesMap(config);

    // need to prepare the namespaces before we can proceed
    config.namespace = namespace;
    await this.prepareNamespaces(config);

    // create cached keys dir if it does not exist yet
    if (!fs.existsSync(config.keysDir)) {
      fs.mkdirSync(config.keysDir, {mode: 0o700});
      FilePermissions.restrictToOwner(config.keysDir, true);
    }

    this.logger.debug('Preparing storage secrets');
    await this.prepareStorageSecrets(config);

    return config;
  }

  private async waitForConfigMapDeletion(context: Context, namespace: NamespaceName): Promise<void> {
    let exists: boolean = await this.k8Factory
      .getK8(context)
      .configMaps()
      .exists(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);

    let attempts: number = 0;

    while (exists && attempts < constants.NETWORK_DESTROY_WAIT_TIMEOUT) {
      await sleep(Duration.ofSeconds(1));

      exists = await this.k8Factory.getK8(context).configMaps().exists(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);

      attempts++;
    }

    if (exists) {
      throw new SoloErrors.system.timeout(
        `Timeout waiting for configMap ${constants.SOLO_REMOTE_CONFIGMAP_NAME} to be deleted.`,
      );
    }
  }

  private async destroyTask(
    task: SoloListrTaskWrapper<NetworkDestroyContext>,
    namespace: NamespaceName,
    deletePvcs: boolean,
    deleteSecrets: boolean,
    contexts: Context[],
  ): Promise<void> {
    task.title = `Uninstalling chart ${constants.SOLO_DEPLOYMENT_CHART}`;

    // Uninstall all 'solo deployment' charts for each cluster using the contexts
    await this.logDestroyResults(
      'Uninstall solo-deployment chart',
      await Promise.allSettled(
        contexts.map(async (context): Promise<void> => {
          await this.chartManager.uninstall(
            namespace,
            constants.SOLO_DEPLOYMENT_CHART,
            this.k8Factory.getK8(context).contexts().readCurrent(),
          );
        }),
      ),
    );

    if (this.oneShotState.isActive()) {
      task.title = `Force terminating pods in namespace ${namespace}`;
      await this.logDestroyResults('Force terminate pods', await this.forceTerminatePods(namespace, contexts));
    }

    task.title = `Deleting the RemoteConfig configmap in namespace ${namespace}`;
    await this.logDestroyResults(
      'Delete remote config configmap',
      await Promise.allSettled(
        contexts.map(async (context): Promise<void> => {
          await this.k8Factory.getK8(context).configMaps().delete(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);
          await this.waitForConfigMapDeletion(context, namespace);
        }),
      ),
    );

    if (deletePvcs) {
      task.title = `Deleting PVCs in namespace ${namespace}`;
      await this.logDestroyResults('Delete PVCs', await Promise.allSettled([this.deletePvcs(namespace, contexts)]));
    }

    if (deleteSecrets) {
      task.title = `Deleting Secrets in namespace ${namespace}`;
      await this.logDestroyResults(
        'Delete secrets',
        await Promise.allSettled([this.deleteSecrets(namespace, contexts)]),
      );
    }

    if (deleteSecrets && deletePvcs) {
      task.title = `Deleting namespace ${namespace}`;
      await this.logDestroyResults(
        'Delete namespace',
        await Promise.allSettled(
          contexts.map(async (context): Promise<void> => {
            const shouldDeleteNamespace: boolean = await new K8Helper(context).isNamespaceOwnedBySolo(namespace);

            if (shouldDeleteNamespace) {
              await this.k8Factory.getK8(context).namespaces().delete(namespace, this.destroyGracePeriodSeconds());
            } else {
              this.logger.warn(`Skipping deletion of namespace '${namespace.name}', not created by solo`);
            }
          }),
        ),
      );
    } else {
      task.title = `Deleting the RemoteConfig configmap in namespace ${namespace}`;
      await Promise.all(
        contexts.map(async (context): Promise<void> => {
          await this.k8Factory.getK8(context).configMaps().delete(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);
          await this.waitForConfigMapDeletion(context, namespace);
        }),
      );

      if (deletePvcs) {
        task.title = `Deleting PVCs in namespace ${namespace}`;
        await this.deletePvcs(namespace, contexts);
      }

      if (deleteSecrets) {
        task.title = `Deleting Secrets in namespace ${namespace}`;
        await this.deleteSecrets(namespace, contexts);
      }
    }
  }

  private destroyGracePeriodSeconds(): number | undefined {
    return this.oneShotState.isActive() ? 0 : undefined;
  }

  private async forceTerminatePods(
    namespace: NamespaceName,
    contexts: Context[],
  ): Promise<PromiseSettledResult<void>[]> {
    return Promise.allSettled(
      contexts.map(async (context): Promise<void> => {
        const k8: K8 = this.k8Factory.getK8(context);
        if (!(await k8.namespaces().has(namespace))) {
          return;
        }
        const pods: Pod[] = await k8.pods().list(namespace, []);
        await Promise.allSettled(
          pods.map((pod: Pod): Promise<void> => k8.pods().readByReference(pod.podReference).killPod(0)),
        );
      }),
    );
  }

  private async logDestroyResults(title: string, results: PromiseSettledResult<void>[]): Promise<void> {
    const failures: PromiseRejectedResult[] = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length === 0) {
      return;
    }

    for (const failure of failures) {
      this.logger.warn(`${title} failed; continuing destroy`, failure.reason);
    }
  }

  private async deleteSecrets(namespace: NamespaceName, contexts: Context[]): Promise<void> {
    const secretsData: Array<{secret: string; context: Context}> = [];

    for (const context of contexts) {
      const secrets: Secret[] = await this.k8Factory.getK8(context).secrets().list(namespace);

      for (const secret of secrets) {
        secretsData.push({secret: secret.name, context: context});
      }
    }

    const promises: Promise<void>[] = secretsData.map(async ({context, secret}): Promise<void> => {
      await this.k8Factory.getK8(context).secrets().delete(namespace, secret);
    });

    await Promise.all(promises);
  }

  private async deletePvcs(namespace: NamespaceName, contexts: Context[]): Promise<void> {
    const pvcsData: Array<{pvc: string; context: Context}> = [];

    for (const context of contexts) {
      const pvcs: string[] = await this.k8Factory.getK8(context).pvcs().list(namespace, []);

      for (const pvc of pvcs) {
        pvcsData.push({pvc, context});
      }
    }

    const promises: Promise<void>[] = pvcsData.map(async ({context, pvc}): Promise<void> => {
      await this.k8Factory
        .getK8(context)
        .pvcs()
        .delete(PvcReference.of(namespace, PvcName.of(pvc)))
        .catch();
    });

    await Promise.all(promises);
  }

  /** Installs the solo-deployment chart with bounded retries to ride out transient API server outages. */
  private async installSoloDeploymentChart(
    config: NetworkDeployConfigClass,
    clusterReference: ClusterReferenceName,
  ): Promise<void> {
    const kubeContext: Context = config.clusterRefs.get(clusterReference);

    for (let attempt: number = 1; attempt <= constants.NETWORK_CHART_INSTALL_MAX_ATTEMPTS; attempt++) {
      try {
        await this.chartManager.upgrade(
          config.namespace,
          constants.SOLO_DEPLOYMENT_CHART,
          constants.SOLO_DEPLOYMENT_CHART,
          config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
          config.soloChartVersion,
          config.chartValuesMap[clusterReference],
          kubeContext,
          false,
          true,
        );
        return;
      } catch (error) {
        if (attempt === constants.NETWORK_CHART_INSTALL_MAX_ATTEMPTS) {
          throw error;
        }

        this.logger.warn(
          `Attempt ${attempt} of ${constants.NETWORK_CHART_INSTALL_MAX_ATTEMPTS} to install chart ` +
            `'${constants.SOLO_DEPLOYMENT_CHART}' failed, retrying in ` +
            `${constants.NETWORK_CHART_INSTALL_RETRY_DELAY_SECS} seconds`,
          error,
        );
        await sleep(Duration.ofSeconds(constants.NETWORK_CHART_INSTALL_RETRY_DELAY_SECS));

        try {
          // remove the release left behind by the failed attempt so the retry starts from a clean state
          await this.chartManager.uninstall(config.namespace, constants.SOLO_DEPLOYMENT_CHART, kubeContext);
        } catch (uninstallError) {
          // best-effort cleanup: a persistent failure will surface on the next upgrade attempt
          this.logger.warn(
            `Failed to uninstall chart '${constants.SOLO_DEPLOYMENT_CHART}' before retry`,
            uninstallError,
          );
        }
      }
    }
  }

  /**
   * Ensure the PodLogs CRD from Grafana Alloy is installed
   */
  private async ensurePodLogsCrd({contexts}: NetworkDeployConfigClass): Promise<void> {
    const PODLOGS_CRD: string = 'podlogs.monitoring.grafana.com';
    const CRD_FILE_PATH: string = 'operations/helm/charts/alloy/charts/crds/crds/monitoring.grafana.com_podlogs.yaml';

    // Use the GitHub Contents API (api.github.com) instead of raw.githubusercontent.com.
    //
    // Why: raw.githubusercontent.com is served by the Fastly CDN and its rate-limiting
    // behaviour for unauthenticated requests is undocumented — adding a token there may
    // have no effect.  The Contents API, on the other hand, is part of the GitHub REST API
    // (api.github.com) whose rate limits are well-documented: 60 req/hour unauthenticated
    // vs 5 000 req/hour when a valid token is supplied.  Since GITHUB_TOKEN is injected
    // automatically into every GitHub Actions job, CI runs always get the higher limit,
    // making 429s far less likely in the first place.
    const CRD_URL: string =
      `https://api.github.com/repos/grafana/alloy/contents/${CRD_FILE_PATH}` +
      `?ref=${versions.GRAFANA_PODLOGS_CRD_VERSION}`;
    const CRD_RAW_URL: string = `https://raw.githubusercontent.com/grafana/alloy/${versions.GRAFANA_PODLOGS_CRD_VERSION}/${CRD_FILE_PATH}`;
    const LOCAL_CRD_FILE: string = PathEx.join(
      constants.ROOT_DIR,
      'resources',
      'crds',
      `monitoring.grafana.com_podlogs-${versions.GRAFANA_PODLOGS_CRD_VERSION}.yaml`,
    );

    for (const context of contexts as string[]) {
      const podLogsCrdLabels: Record<string, string> | undefined = await this.k8Factory
        .getK8(context)
        .crds()
        .readLabels(PODLOGS_CRD);
      if (podLogsCrdLabels !== undefined) {
        SharedClusterResourceReport.show(
          this.logger,
          `CRD '${PODLOGS_CRD}'`,
          context,
          SharedClusterResourceReport.versionFromLabels(podLogsCrdLabels),
          `version ${versions.GRAFANA_PODLOGS_CRD_VERSION}`,
        );
        continue;
      }

      this.logger.info(`Installing missing CRD ${PODLOGS_CRD} from ${CRD_URL} in context ${context}...`);

      const temporaryFile: string = PathEx.join(
        constants.SOLO_CACHE_DIR,
        `podlogs-crd-${versions.GRAFANA_PODLOGS_CRD_VERSION}.yaml`,
      );

      // Download and cache the CRD YAML.  The cache file is keyed by the CRD version so
      // it is automatically invalidated when GRAFANA_PODLOGS_CRD_VERSION is bumped.
      // SOLO_CACHE_DIR persists across job steps (unlike os.tmpdir() which is ephemeral),
      // ensuring we only make one network request per job even if multiple contexts need
      // the CRD installed.
      if (!fs.existsSync(temporaryFile)) {
        // Prefer a vendored CRD file to avoid external network/rate-limit failures in CI.
        if (fs.existsSync(LOCAL_CRD_FILE)) {
          fs.copyFileSync(LOCAL_CRD_FILE, temporaryFile);
          this.logger.debug(`Using local PodLogs CRD file: ${LOCAL_CRD_FILE}`);
        } else {
          const downloadErrors: string[] = [];

          // Attempt #1: GitHub Contents API.
          // The response is a JSON envelope with base64 content.
          const apiHeaders: Record<string, string> = {Accept: 'application/vnd.github.v3+json'};
          if (process.env.GITHUB_TOKEN) {
            apiHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
          }
          const apiResponse: Response = await fetch(CRD_URL, {headers: apiHeaders});

          if (apiResponse.ok) {
            const json: {content: string} = (await apiResponse.json()) as {content: string};
            const yamlContent: string = Buffer.from(json.content.replaceAll(/\s/g, ''), 'base64').toString('utf8');
            fs.writeFileSync(temporaryFile, yamlContent, 'utf8');
          } else {
            const apiError: string = `${apiResponse.status} ${apiResponse.statusText}`.trim();
            downloadErrors.push(`GitHub API: ${apiError}`);
            this.logger.warn(`Failed to download PodLogs CRD from GitHub API (${apiError}), trying raw URL fallback.`);

            // Attempt #2: raw.githubusercontent.com fallback.
            const rawHeaders: Record<string, string> = {};
            if (process.env.GITHUB_TOKEN) {
              rawHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
            }
            const rawResponse: Response = await fetch(CRD_RAW_URL, {headers: rawHeaders});
            if (!rawResponse.ok) {
              const rawError: string = `${rawResponse.status} ${rawResponse.statusText}`.trim();
              downloadErrors.push(`Raw URL: ${rawError}`);
              throw new Error(`Failed to download CRD YAML (${downloadErrors.join('; ')})`);
            }
            const yamlContent: string = await rawResponse.text();
            fs.writeFileSync(temporaryFile, yamlContent, 'utf8');
          }
        }
      }

      // The cached CRD file may have been copyFileSync'd from a packaged (0755) source, bypassing umask.
      FilePermissions.restrictTreeToOwner(temporaryFile);

      await this.k8Factory.getK8(context).manifests().applyManifest(temporaryFile);
    }
  }

  /**
   * Ensure all Prometheus Operator CRDs exist; install chart only if needed.
   * If all CRDs are already present or monitoring support is disabled, skip installation.
   */
  /** Ensure Prometheus Operator CRDs are present; install missing ones via the chart */
  private async ensurePrometheusOperatorCrds({
    clusterRefs,
    namespace,
    deployment,
  }: NetworkDeployConfigClass): Promise<void> {
    const CRDS: {key: string; crd: string}[] = [
      {key: 'alertmanagerconfigs', crd: 'alertmanagerconfigs.monitoring.coreos.com'},
      {key: 'alertmanagers', crd: 'alertmanagers.monitoring.coreos.com'},
      {key: 'podmonitors', crd: 'podmonitors.monitoring.coreos.com'},
      {key: 'probes', crd: 'probes.monitoring.coreos.com'},
      {key: 'prometheusagents', crd: 'prometheusagents.monitoring.coreos.com'},
      {key: 'prometheuses', crd: 'prometheuses.monitoring.coreos.com'},
      {key: 'prometheusrules', crd: 'prometheusrules.monitoring.coreos.com'},
      {key: 'scrapeconfigs', crd: 'scrapeconfigs.monitoring.coreos.com'},
      {key: 'servicemonitors', crd: 'servicemonitors.monitoring.coreos.com'},
      {key: 'thanosrulers', crd: 'thanosrulers.monitoring.coreos.com'},
    ];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_, context] of clusterRefs) {
      const chartValues: HelmChartValues = new HelmChartValues();
      const foundCrdVersions: Set<string> = new Set<string>();

      const presentCrds: Map<string, Record<string, string>> = await ClusterCrdProbe.probe(
        this.k8Factory,
        context,
        CRDS.map(({crd}): string => crd),
      );
      const missingCount: number = CRDS.length - presentCrds.size;

      for (const {key, crd} of CRDS) {
        const crdLabels: Record<string, string> | undefined = presentCrds.get(crd);
        if (crdLabels !== undefined) {
          chartValues.set(`${key}.enabled`, false);
          foundCrdVersions.add(SharedClusterResourceReport.versionFromLabels(crdLabels));
        }
      }

      if (foundCrdVersions.size > 0) {
        SharedClusterResourceReport.show(
          this.logger,
          'Prometheus Operator CRDs',
          context,
          `${CRDS.length - missingCount} of ${CRDS.length} CRDs already present (${[...foundCrdVersions].join(', ')})`,
          `version ${versions.PROMETHEUS_OPERATOR_CRDS_VERSION}`,
        );
      }

      if (missingCount === 0) {
        continue;
      }

      const setupMap: Map<string, string> = new Map([
        [constants.PROMETHEUS_OPERATOR_CRDS_RELEASE_NAME, constants.PROMETHEUS_OPERATOR_CRDS_CHART_URL],
      ]);

      await this.chartManager.setup(setupMap);

      await this.chartManager.install(
        namespace,
        constants.PROMETHEUS_OPERATOR_CRDS_RELEASE_NAME,
        constants.PROMETHEUS_OPERATOR_CRDS_CHART,
        constants.PROMETHEUS_OPERATOR_CRDS_CHART,
        versions.PROMETHEUS_OPERATOR_CRDS_VERSION,
        chartValues,
        context,
      );

      this.eventBus.emit(new NetworkDeployedEvent(deployment));

      showVersionBanner(
        this.logger,
        constants.PROMETHEUS_OPERATOR_CRDS_CHART,
        versions.PROMETHEUS_OPERATOR_CRDS_VERSION,
      );
    }
  }

  /**
   * Patch the ServiceMonitor created by the solo-deployment helm chart so that it is discovered
   * by the kube-prometheus-stack Prometheus operator and targets the correct consensus node services.
   *
   * Two fixes are applied via a merge patch:
   * 1. Adds the `release: <PROMETHEUS_RELEASE_NAME>` label so the Prometheus instance from
   *    kube-prometheus-stack (which selects ServiceMonitors by `release` label) can discover it.
   * 2. Corrects `spec.selector.matchLabels` to `solo.hedera.com/type: network-node-svc` so the
   *    ServiceMonitor targets the non-headless consensus-node services (which expose the prometheus
   *    metrics port) rather than the hard-coded `network-node` value in the helm chart template.
   */
  private async patchServiceMonitorForPrometheus(namespace: NamespaceName, context: Context): Promise<void> {
    const patch: object = {
      apiVersion: 'monitoring.coreos.com/v1',
      kind: 'ServiceMonitor',
      metadata: {
        name: constants.SOLO_SERVICE_MONITOR_NAME,
        namespace: namespace.name,
        labels: {
          release: constants.PROMETHEUS_RELEASE_NAME,
        },
      },
      spec: {
        selector: {
          matchLabels: {
            'solo.hedera.com/type': 'network-node-svc',
          },
        },
      },
    };

    await this.k8Factory.getK8(context).manifests().patchObject(patch);
    this.logger.debug(
      `Patched ServiceMonitor '${constants.SOLO_SERVICE_MONITOR_NAME}' in namespace '${namespace.name}': ` +
        `added label release=${constants.PROMETHEUS_RELEASE_NAME} and fixed selector to network-node-svc`,
    );
  }

  /** Run helm install and deploy network components */
  public async deploy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<NetworkDeployContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            this.configManager.update(argv);
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv, true, true);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

            // Read release-tag from argv (closure-captured, immutable) rather than configManager.
            // configManager is a process-wide singleton shared across concurrent subcommands invoked
            // from one-shot. Other subcommands (e.g. block-node add) run their own configManager.update(argv)
            // with their yargs-defaulted release-tag, which can race-overwrite the value set above.
            const argvReleaseTag: string | undefined = SemanticVersion.normalizeToken(
              argv[flags.consensusNodeVersion.name],
            );
            const configReleaseTag: string | undefined = SemanticVersion.normalizeToken(
              this.configManager.getFlag(flags.consensusNodeVersion),
            );
            const releaseTag: SemanticVersion<string> = new SemanticVersion<string>(argvReleaseTag || configReleaseTag);

            if (
              this.remoteConfig.configuration.versions.consensusNode.toString() === '0.0.0' ||
              !new SemanticVersion<string>(this.remoteConfig.configuration.versions.consensusNode).equals(releaseTag)
            ) {
              // if is possible block node deployed before consensus node, then use release tag as fallback
              this.remoteConfig.configuration.versions.consensusNode = releaseTag;
              await this.remoteConfig.persist();
            }

            const currentVersion: SemanticVersion<string> = new SemanticVersion<string>(
              this.remoteConfig.configuration.versions.consensusNode.toString(),
            );

            let tssEnabled: boolean = this.configManager.getFlag(flags.tssEnabled);
            const minimumVersion: SemanticVersion<string> = new SemanticVersion<string>(
              versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS,
            );

            // if platform version is insufficient for tss, disable it
            if (tssEnabled && new SemanticVersion<string>(currentVersion).lessThan(minimumVersion)) {
              tssEnabled = false;
            }

            const wrapsEnabled: boolean = this.configManager.getFlag(flags.wrapsEnabled);
            this.remoteConfig.configuration.state.wrapsEnabled = wrapsEnabled;

            if (wrapsEnabled && new SemanticVersion<string>(currentVersion).lessThan(minimumVersion)) {
              this.logger.showUser(
                `Consensus node version ${currentVersion} does not support TSS or Wraps. Please upgrade to version ${minimumVersion} or later to enable these features.`,
              );
              throw new SoloErrors.validation.wrapsVersionConstraint(versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS);
            }

            this.remoteConfig.configuration.state.tssEnabled = tssEnabled;

            // Deployment-wide block node message-size overrides written into block-nodes.json.
            // Persisted here so every later regeneration (node add/setup, block node add, etc.) honors them.
            const softLimitBytes: number = this.configManager.getFlag(flags.blockNodeMessageSizeSoftLimitBytes);
            const hardLimitBytes: number = this.configManager.getFlag(flags.blockNodeMessageSizeHardLimitBytes);
            if (typeof softLimitBytes === 'number') {
              this.remoteConfig.configuration.state.blockNodeMessageSizeSoftLimitBytes = softLimitBytes;
            }
            if (typeof hardLimitBytes === 'number') {
              this.remoteConfig.configuration.state.blockNodeMessageSizeHardLimitBytes = hardLimitBytes;
            }

            await this.remoteConfig.persist();

            context_.config = await this.prepareConfig(task, argv);
            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        {
          title: 'Copy gRPC TLS Certificates',
          task: (
            {config: {grpcTlsCertificatePath, grpcWebTlsCertificatePath, grpcTlsKeyPath, grpcWebTlsKeyPath}},
            parentTask,
          ): SoloListr<AnyListrContext> =>
            this.certificateManager.buildCopyTlsCertificatesTasks(
              parentTask,
              grpcTlsCertificatePath,
              grpcWebTlsCertificatePath,
              grpcTlsKeyPath,
              grpcWebTlsKeyPath,
            ),
          skip: ({config: {grpcTlsCertificatePath, grpcWebTlsCertificatePath}}): boolean =>
            !grpcTlsCertificatePath && !grpcWebTlsCertificatePath,
        },
        {
          title: 'Copy node keys to secrets',
          task: ({config: {keysDir, consensusNodes, contexts}}, parentTask): SoloListr<NetworkDeployContext> => {
            // set up the subtasks
            return parentTask.newListr(
              this.platformInstaller.copyNodeKeys(keysDir, consensusNodes, contexts),
              constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY,
            );
          },
        },
        {
          title: 'Remove cached keys',
          // When --debug is off, the keys now live only in the cluster secrets (uploaded by the task above), so
          // remove the on-disk copies to avoid leaving private keys in SOLO_CACHE_DIR. Later node commands
          // re-read them from the secrets in-memory when rebuilding the secrets.
          skip: (): boolean | string =>
            this.configManager.getFlag<boolean>(flags.debugMode)
              ? '--debug enabled, keeping cached keys on disk'
              : false,
          task: ({config: {keysDir}}): void => {
            if (keysDir && fs.existsSync(keysDir)) {
              fs.rmSync(keysDir, {recursive: true, force: true});
            }
          },
        },
        {
          title: 'Install monitoring CRDs',
          skip: ({config: {enableMonitoringSupport}}): boolean => !enableMonitoringSupport,
          task: (_, task): SoloListr<NetworkDeployContext> => {
            const tasks: SoloListrTask<NetworkDeployContext>[] = [
              {
                title: 'Pod Logs CRDs',
                task: async ({config}): Promise<void> => await this.ensurePodLogsCrd(config),
              },
              {
                title: 'Prometheus Operator CRDs',
                task: async ({config}): Promise<void> => await this.ensurePrometheusOperatorCrds(config),
              },
            ];

            return task.newListr(tasks, {concurrent: true, rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION});
          },
        },
        {
          title: `Install chart '${constants.SOLO_DEPLOYMENT_CHART}'`,
          task: async ({config}): Promise<void> => {
            const {namespace, clusterRefs} = config;

            for (const [clusterReference] of clusterRefs) {
              const isInstalled: boolean = await this.chartManager.isChartInstalled(
                namespace,
                constants.SOLO_DEPLOYMENT_CHART,
                clusterRefs.get(clusterReference),
              );
              if (isInstalled) {
                await this.chartManager.uninstall(
                  namespace,
                  constants.SOLO_DEPLOYMENT_CHART,
                  clusterRefs.get(clusterReference),
                );
                config.isUpgrade = true;
              }

              config.soloChartVersion = SemanticVersion.getValidSemanticVersion(
                config.soloChartVersion,
                false,
                'Solo chart version',
                versions.MINIMUM_SOLO_CHART_VERSION,
              );

              await this.installSoloDeploymentChart(config, clusterReference);
              showVersionBanner(this.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion);
            }
          },
        },
        {
          title: 'Patch ServiceMonitor for Prometheus discovery',
          skip: ({config: {enableMonitoringSupport}}): boolean => !enableMonitoringSupport,
          task: async ({config: {namespace, clusterRefs}}): Promise<void> => {
            for (const [, context] of clusterRefs) {
              await this.patchServiceMonitorForPrometheus(namespace, context);
            }
          },
        },
        {
          title: 'Check for load balancer',
          skip: ({config: {loadBalancerEnabled}}): boolean => loadBalancerEnabled === false,
          task: ({config: {consensusNodes, namespace}}, task): SoloListr<NetworkDeployContext> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];

            //Add check for network node service to be created and load balancer to be assigned (if load balancer is enabled)
            for (const consensusNode of consensusNodes) {
              subTasks.push({
                title: `Load balancer is assigned for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async (): Promise<void> => {
                  try {
                    await this.k8Factory
                      .getK8(consensusNode.context)
                      .services()
                      .waitForLoadBalancerAddress(
                        namespace,
                        Templates.renderNodeSvcLabelsFromNodeId(consensusNode.nodeId),
                        constants.LOAD_BALANCER_CHECK_MAX_ATTEMPTS,
                        Duration.ofSeconds(constants.LOAD_BALANCER_CHECK_DELAY_SECS).toMillis(),
                      );
                  } catch (error) {
                    throw new SoloErrors.system.loadBalancerNotFound(error);
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
        // TODO: find a better solution to avoid the need to redeploy the chart
        {
          title: 'Redeploy chart with external IP address config',
          skip: ({config: {loadBalancerEnabled}}): boolean => loadBalancerEnabled === false,
          task: async ({config}, task): Promise<SoloListr<NetworkDeployContext>> => {
            const {namespace, chartDirectory, soloChartVersion, clusterRefs} = config;

            // Update the chartValuesMap with the external IP addresses
            // This regenerates the genesis-network.json file with the external IP addresses
            config.chartValuesMap = await this.prepareHelmChartValuesMap(config);

            // Perform a helm upgrade for each cluster
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            for (const [clusterReference] of clusterRefs) {
              subTasks.push({
                title: `Upgrade chart for cluster: ${chalk.yellow(clusterReference)}`,
                task: async (): Promise<void> => {
                  await this.chartManager.upgrade(
                    namespace,
                    constants.SOLO_DEPLOYMENT_CHART,
                    constants.SOLO_DEPLOYMENT_CHART,
                    chartDirectory || constants.SOLO_TESTING_CHART_URL,
                    soloChartVersion,
                    config.chartValuesMap[clusterReference],
                    clusterRefs.get(clusterReference),
                    false,
                    true,
                  );
                  showVersionBanner(this.logger, constants.SOLO_DEPLOYMENT_CHART, soloChartVersion, 'Upgraded');

                  // TODO: Remove this code now that we have made the config dynamic and can update it without redeploying
                  const k8: K8 = this.k8Factory.getK8(clusterRefs.get(clusterReference));

                  const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);

                  for (const pod of pods) {
                    await k8.pods().readByReference(pod.podReference).killPod();
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
        this.verifyPersistentVolumeClaimMounts(),
        {
          title: 'Check proxy pods are running',
          task: (context_, task): SoloListr<NetworkDeployContext> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            const config: NetworkDeployConfigClass = context_.config;

            // HAProxy
            for (const consensusNode of config.consensusNodes) {
              subTasks.push({
                title: `Check HAProxy for: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async (): Promise<Pod[]> =>
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
                task: async (): Promise<Pod[]> =>
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
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [
              {
                title: 'Check MinIO',
                task: async ({config: {contexts, namespace}}): Promise<void> => {
                  for (const context of contexts) {
                    await this.k8Factory
                      .getK8(context)
                      .pods()
                      .waitForReadyStatus(
                        namespace,
                        ['v1.min.io/tenant=minio'],
                        constants.PODS_RUNNING_MAX_ATTEMPTS,
                        constants.PODS_RUNNING_DELAY,
                      );
                  }
                },
                // skip if only cloud storage is/are used
                skip: ({config: {storageType, minioEnabled}}): boolean =>
                  !minioEnabled ||
                  storageType === constants.StorageType.GCS_ONLY ||
                  storageType === constants.StorageType.AWS_ONLY ||
                  storageType === constants.StorageType.AWS_AND_GCS,
              },
            ];

            // minio

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
        {
          title: 'Copy wraps lib into consensus node',
          skip: (): boolean => !this.remoteConfig.configuration.state.wrapsEnabled,
          task: async ({config}, task): Promise<SoloListr<NetworkDeployContext>> => {
            const wraps: Wraps = this.soloConfig.tss.wraps;
            const extractedDirectory: string = PathEx.join(constants.SOLO_CACHE_DIR, wraps.directoryName);

            if (config.wrapsKeyPath) {
              // Use user-provided local directory containing WRAPs proving key files
              if (!fs.existsSync(config.wrapsKeyPath)) {
                throw new SoloErrors.validation.wrapsKeyPathNotFound(config.wrapsKeyPath);
              }
              this.logger.info(`Using WRAPs proving key files from: ${config.wrapsKeyPath}`);

              // Copy allowed .bin files from user path into the cache directory
              if (!fs.existsSync(extractedDirectory)) {
                fs.mkdirSync(extractedDirectory, {recursive: true});
              }

              const allowedFiles: Set<string> = wraps.allowedKeyFileSet;

              for (const file of fs.readdirSync(config.wrapsKeyPath)) {
                if (allowedFiles.has(file)) {
                  fs.copyFileSync(PathEx.join(config.wrapsKeyPath, file), PathEx.join(extractedDirectory, file));
                }
              }
            } else {
              if (fs.existsSync(extractedDirectory)) {
                this.logger.debug('Wraps library already installed');
              } else {
                await this.downloader.fetchPackage(
                  wraps.libraryDownloadUrl,
                  'unusued',
                  constants.SOLO_CACHE_DIR,
                  false,
                  '',
                  false,
                );

                const tarFilePath: string = PathEx.join(constants.SOLO_CACHE_DIR, `${wraps.directoryName}.tar.gz`);

                // Create extraction dir
                fs.mkdirSync(extractedDirectory);

                // Extract wraps-v0.2.0.tar.gz -> wraps-v0.2.0
                this.zippy.untar(tarFilePath, extractedDirectory);
              }

              // Having any files except for those inside the folder causes an error in CN
              const allowedFiles: Set<string> = wraps.allowedKeyFileSet;

              for (const file of fs.readdirSync(extractedDirectory)) {
                if (!allowedFiles.has(file)) {
                  const filePath: string = PathEx.join(extractedDirectory, file);
                  fs.unlinkSync(filePath); // delete unwanted file
                }
              }
            }

            // CN >= v0.76 loads the WRAPS proving key from a tarball at data/keys/wraps.tar.gz
            // (tss.wrapsProvingKeyPath) at genesis, not from the pre-extracted
            // TSS_LIB_WRAPS_ARTIFACTS_PATH directory. If the wraps-key-path directory carries the
            // tarball, stage it under that exact name so the library is ready for the genesis history
            // proof (construction #1). Without it the CN races a ~2 GB runtime download that finishes
            // just after construction #1 finalizes, leaving it WRAPS-extensible=false forever.
            let wrapsTarball: string | undefined;
            if (config.wrapsKeyPath) {
              const tarballName: string | undefined = fs
                .readdirSync(config.wrapsKeyPath)
                .find((file: string): boolean => file.endsWith('.tar.gz'));
              if (tarballName) {
                wrapsTarball = PathEx.join(constants.SOLO_CACHE_DIR, 'wraps.tar.gz');
                fs.copyFileSync(PathEx.join(config.wrapsKeyPath, tarballName), wrapsTarball);
              }
            }

            // The library is hundreds of megabytes per node, so on a large network the copies
            // dominate deploy time. Running them concurrently is much faster but puts every
            // transfer on the same link at once, which is the wrong trade on a constrained
            // connection -- hence the flag rather than a fixed choice.
            const subTasks: SoloListrTask<NetworkDeployContext>[] = config.consensusNodes.map(
              (consensusNode: ConsensusNode): SoloListrTask<NetworkDeployContext> => ({
                title: `Copy wraps lib to node: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.cluster)}`,
                task: async (): Promise<void> => {
                  const rootContainer: Container = await new K8Helper(
                    consensusNode.context,
                  ).getConsensusNodeRootContainer(config.namespace, consensusNode.name);

                  await rootContainer.copyTo(extractedDirectory, `${constants.HEDERA_HAPI_PATH}/data/keys`);

                  if (wrapsTarball) {
                    await rootContainer.copyTo(wrapsTarball, `${constants.HEDERA_HAPI_PATH}/data/keys`);
                  }
                },
              }),
            );

            return task.newListr(subTasks, {
              concurrent: constants.EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: `Copy ${constants.BLOCK_NODES_JSON_FILE}`,
          skip: ({config: {blockNodeComponents}}): boolean => blockNodeComponents.length === 0,
          task: async ({config: {consensusNodes}}): Promise<void> => {
            try {
              for (const consensusNode of consensusNodes) {
                await createAndCopyBlockNodeJsonFileForConsensusNode(
                  consensusNode,
                  this.logger,
                  this.k8Factory,
                  false,
                  this.remoteConfig.configuration.versions.consensusNode,
                  this.remoteConfig.configuration.state.tssEnabled,
                );
              }
            } catch (error) {
              throw new SoloErrors.component.blockNodeConfigFailed(error);
            }
          },
        },
        {
          title: 'Copy JFR config file to nodes',
          skip: ({config: {javaFlightRecorderConfiguration}}): boolean => javaFlightRecorderConfiguration.length === 0,
          task: async (
            {config: {consensusNodes, javaFlightRecorderConfiguration}},
            task,
          ): Promise<SoloListr<NetworkDeployContext>> => {
            const subTasks: SoloListrTask<NetworkDeployContext>[] = [];
            for (const consensusNode of consensusNodes) {
              subTasks.push({
                title: `Copy config JFR file to node: ${chalk.yellow(consensusNode.name)}, cluster: ${chalk.yellow(consensusNode.context)}`,
                task: async (): Promise<void> => {
                  try {
                    const container: Container = await new K8Helper(
                      consensusNode.context,
                    ).getConsensusNodeRootContainer(NamespaceName.of(consensusNode.namespace), consensusNode.name);
                    const destinationDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/config`;
                    await container.copyTo(javaFlightRecorderConfiguration, destinationDirectory);
                    await container.execContainer([
                      'bash',
                      '-c',
                      `chown hedera:hedera ${destinationDirectory}/${path.basename(javaFlightRecorderConfiguration)} 2>/dev/null || true`,
                    ]);
                  } catch (error) {
                    throw new SoloErrors.component.blockNodeConfigFailed(error);
                  }
                },
              });
            }

            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'consensus network deploy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.chartInstallFailed(constants.SOLO_DEPLOYMENT_CHART, error);
      } finally {
        if (lease && !this.oneShotState.isActive()) {
          await lease.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    let networkDestroySuccess: boolean = true;

    const tasks: SoloListr<NetworkDestroyContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            const remoteConfigLoaded: boolean = await this.loadRemoteConfigOrWarn(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }

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
              deletePvcs: this.configManager.getFlag(flags.deletePvcs),
              deleteSecrets: this.configManager.getFlag(flags.deleteSecrets),
              deployment: this.configManager.getFlag(flags.deployment),
              namespace: await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task),
              enableTimeout: this.configManager.getFlag(flags.enableTimeout),
              force: this.configManager.getFlag(flags.force),
              contexts: remoteConfigLoaded
                ? this.remoteConfig.getContexts()
                : [...this.localConfig.configuration.clusterRefs.values()].map((context): Context =>
                    context.toString(),
                  ),
            };

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        {
          title: 'Destroy network resources',
          task: (_, parentTask): SoloListr<NetworkDestroyContext> =>
            parentTask.newListr(
              [
                {
                  title: 'Running sub-tasks to destroy network',
                  task: async (
                    {config: {enableTimeout, deletePvcs, deleteSecrets, namespace, contexts}},
                    task,
                  ): Promise<void> => {
                    if (!enableTimeout) {
                      await this.destroyTask(task, namespace, deletePvcs, deleteSecrets, contexts);
                      return;
                    }

                    const onTimeoutCallback: NodeJS.Timeout = setTimeout(async (): Promise<void> => {
                      const message: string = `\n\nUnable to finish consensus network destroy in ${constants.NETWORK_DESTROY_WAIT_TIMEOUT} seconds\n\n`;
                      this.logger.error(message);
                      this.logger.showUser(chalk.red(message));
                      networkDestroySuccess = false;

                      if (!deleteSecrets || !deletePvcs) {
                        await this.remoteConfig.deleteComponents();
                        return;
                      }

                      for (const context of contexts) {
                        const shouldDeleteNamespace: boolean = await new K8Helper(context).isNamespaceOwnedBySolo(
                          namespace,
                        );

                        if (shouldDeleteNamespace) {
                          await this.k8Factory
                            .getK8(context)
                            .namespaces()
                            .delete(namespace, this.destroyGracePeriodSeconds());
                        } else {
                          this.logger.warn(`Skipping deletion of namespace '${namespace.name}', not created by solo`);
                        }
                      }
                    }, constants.NETWORK_DESTROY_WAIT_TIMEOUT * 1000);

                    await this.destroyTask(task, namespace, deletePvcs, deleteSecrets, contexts);

                    clearTimeout(onTimeoutCallback);
                  },
                },
                {
                  title: `Remove ${constants.SOLO_SETUP_NAMESPACE.name}`,
                  task: async ({config: {contexts}}): Promise<void> => {
                    const namespace: NamespaceName = constants.SOLO_SETUP_NAMESPACE;

                    if (this.oneShotState.isActive()) {
                      await this.forceTerminatePods(namespace, contexts);
                    }

                    for (const context of contexts) {
                      if (await this.k8Factory.getK8(context).namespaces().has(namespace)) {
                        await this.k8Factory
                          .getK8(context)
                          .namespaces()
                          .delete(namespace, this.destroyGracePeriodSeconds());
                      }
                    }
                  },
                },
              ],
              {
                concurrent: this.oneShotState.isActive(),
                rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
              },
            ),
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'consensus network destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.networkDestroyFailed(error);
      } finally {
        // If the namespace is deleted, the lease can't be released
        if (!this.oneShotState.isActive()) {
          await lease?.release().catch();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return networkDestroySuccess;
  }

  /** Adds the consensus node, envoy and haproxy components to remote config.  */
  public addNodesAndProxies(): SoloListrTask<NetworkDeployContext> {
    return {
      title: 'Add node and proxies to remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config: {consensusNodes, namespace, isUpgrade, releaseTag}}): Promise<void> => {
        for (const consensusNode of consensusNodes) {
          const componentId: ComponentId = Templates.renderComponentIdFromNodeAlias(consensusNode.name);
          const clusterReference: ClusterReferenceName = consensusNode.cluster;

          this.remoteConfig.configuration.components.changeNodePhase(componentId, DeploymentPhase.REQUESTED);

          if (isUpgrade) {
            this.logger.info('Do not add envoy and haproxy components again during upgrade');
          } else {
            // do not add new envoy or haproxy components if they already exist
            this.remoteConfig.configuration.components.addNewComponent(
              this.componentFactory.createNewEnvoyProxyComponent(clusterReference, namespace),
              ComponentTypes.EnvoyProxy,
            );

            this.remoteConfig.configuration.components.addNewComponent(
              this.componentFactory.createNewHaProxyComponent(clusterReference, namespace),
              ComponentTypes.HaProxy,
            );
          }
        }
        if (releaseTag) {
          // update the solo chart version to match the deployed version
          this.remoteConfig.updateComponentVersion(
            ComponentTypes.ConsensusNode,
            new SemanticVersion<string>(releaseTag),
          );
        }

        await this.remoteConfig.persist();
      },
    };
  }

  private getBlockNodes(): BlockNodeStateSchema[] {
    return this.remoteConfig.configuration.components.state.blockNodes;
  }

  public async close(): Promise<void> {} // no-op
}
