// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../core/errors/solo-errors.js';
import {Listr} from 'listr2';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {UserBreak} from '../core/errors/user-break.js';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {entityId, showVersionBanner, sleep} from '../core/helpers.js';
import {Duration} from '../core/time/duration.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {type Rbacs} from '../integration/kube/resources/rbac/rbacs.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as fs from 'node:fs';
import {
  type ClusterReferenceName,
  type ComponentId,
  type Context,
  type DeploymentName,
  type NamespaceNameAsString,
  type Optional,
  type Realm,
  type Shard,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import * as versions from '../../version.js';
import {INGRESS_CONTROLLER_VERSION} from '../../version.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {type Pods} from '../integration/kube/resources/pod/pods.js';
import chalk from 'chalk';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {PvcReference} from '../integration/kube/resources/pvc/pvc-reference.js';
import {PvcName} from '../integration/kube/resources/pvc/pvc-name.js';
import {KeyManager} from '../core/key-manager.js';
import {PathEx} from '../business/utils/path-ex.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {MirrorNodeStateSchema} from '../data/schema/model/remote/state/mirror-node-state-schema.js';
import {Lock} from '../core/lock/lock.js';
import {Base64} from 'js-base64';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {assertUpgradeVersionNotOlder} from '../core/upgrade-version-guard.js';
import {UpgradeVersionResolver} from '../core/upgrade-version-resolver.js';
import {IngressClass} from '../integration/kube/resources/ingress-class/ingress-class.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {PostgresStateSchema} from '../data/schema/model/remote/state/postgres-state-schema.js';
import {RedisStateSchema} from '../data/schema/model/remote/state/redis-state-schema.js';
import {Templates} from '../core/templates.js';
import {RemoteConfig} from '../business/runtime-state/config/remote/remote-config.js';
import {ClusterSchema} from '../data/schema/model/common/cluster-schema.js';
import yaml from 'yaml';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {PostgresSharedResource} from '../core/shared-resources/postgres.js';
import {SharedResourceManager} from '../core/shared-resources/shared-resource-manager.js';
import {MirrorNodeDeployedEvent} from '../core/events/event-types/mirror-node-deployed-event.js';
import {type SoloEventBus} from '../core/events/solo-event-bus.js';
import {optionFromFlag} from './command-helpers.js';
import {ImageReference, type ParsedImageReference} from '../business/utils/image-reference.js';
import {HelmChartValues} from '../integration/helm/model/values.js';
import {K8} from '../integration/kube/k8.js';
import {HelmSchedulingValues} from '../core/util/helm-scheduling-values.js';
// Port forwarding is now a method on the components object

interface MirrorNodeDeployConfigClass {
  isChartInstalled: boolean;
  cacheDir: string;
  chartDirectory: string;
  mirrorNodeChartDirectory: string;
  clusterContext: string;
  clusterReference: ClusterReferenceName;
  namespace: NamespaceName;
  enableIngress: boolean;
  ingressControllerValueFile: string;
  mirrorStaticIp: string;
  valuesFile: string;
  chartValues: HelmChartValues;
  quiet: boolean;
  mirrorNodeVersion: string;
  componentImage: string;
  componentImageArchive: string;
  pinger: boolean;
  operatorId: string;
  operatorKey: string;
  useExternalDatabase: boolean;
  storageType: constants.StorageType;
  storageReadAccessKey: string;
  storageReadSecrets: string;
  storageEndpoint: string;
  storageBucket: string;
  storageBucketPrefix: string;
  storageBucketRegion: string;
  externalDatabaseHost: Optional<string>;
  externalDatabaseOwnerUsername: Optional<string>;
  externalDatabaseOwnerPassword: Optional<string>;
  externalDatabaseReadonlyUsername: Optional<string>;
  externalDatabaseReadonlyPassword: Optional<string>;
  domainName: Optional<string>;
  forcePortForward: Optional<boolean>;
  releaseName: string;
  ingressReleaseName: string;
  newMirrorNodeComponent: MirrorNodeStateSchema;
  isLegacyChartInstalled: boolean;
  id: number;
  soloChartVersion: string;
  deployment: DeploymentName;
  forceBlockNodeIntegration: boolean; // Used to bypass version requirements for block node integration
  installSharedResources: boolean;
  parallelDeploy: boolean;
}

interface MirrorNodeDeployContext {
  config: MirrorNodeDeployConfigClass;
  addressBook: string;
}

interface MirrorNodeUpgradeConfigClass {
  isChartInstalled: boolean;
  cacheDir: string;
  chartDirectory: string;
  mirrorNodeChartDirectory: string;
  clusterContext: string;
  clusterReference: ClusterReferenceName;
  namespace: NamespaceName;
  enableIngress: boolean;
  ingressControllerValueFile: string;
  mirrorStaticIp: string;
  valuesFile: string;
  chartValues: HelmChartValues;
  quiet: boolean;
  mirrorNodeVersion: string;
  componentImage: string;
  componentImageArchive: string;
  pinger: boolean;
  operatorId: string;
  operatorKey: string;
  useExternalDatabase: boolean;
  storageType: constants.StorageType;
  storageReadAccessKey: string;
  storageReadSecrets: string;
  storageEndpoint: string;
  storageBucket: string;
  storageBucketPrefix: string;
  storageBucketRegion: string;
  externalDatabaseHost: Optional<string>;
  externalDatabaseOwnerUsername: Optional<string>;
  externalDatabaseOwnerPassword: Optional<string>;
  externalDatabaseReadonlyUsername: Optional<string>;
  externalDatabaseReadonlyPassword: Optional<string>;
  domainName: Optional<string>;
  forcePortForward: Optional<boolean>;
  releaseName: string;
  ingressReleaseName: string;
  isLegacyChartInstalled: boolean;
  id: number;
  soloChartVersion: string;
  installSharedResources: boolean;
  forceBlockNodeIntegration: boolean; // Used to bypass version requirements for block node integration
  deployment: DeploymentName;
}

interface MirrorNodeUpgradeContext {
  config: MirrorNodeUpgradeConfigClass;
  addressBook: string;
}

interface MirrorNodeDestroyConfigClass {
  namespace: NamespaceName;
  clusterContext: string;
  isChartInstalled: boolean;
  clusterReference: ClusterReferenceName;
  id: ComponentId;
  releaseName: string;
  ingressReleaseName: string;
  isLegacyChartInstalled: boolean;
  isIngressControllerChartInstalled: boolean;
}

interface MirrorNodeDestroyContext {
  config: MirrorNodeDestroyConfigClass;
}

interface InferredData {
  id: ComponentId;
  releaseName: string;
  isChartInstalled: boolean;
  ingressReleaseName: string;
  isLegacyChartInstalled: boolean;
}

enum MirrorNodeCommandType {
  ADD = 'add',
  UPGRADE = 'upgrade',
  DESTROY = 'destroy',
}

@injectable()
export class MirrorNodeCommand extends BaseCommand {
  private static readonly MIRROR_ENVIRONMENT_VARIABLE_PREFIX: string = 'HIERO';
  private static readonly MIRROR_CHART_NAMESPACE: string = 'hiero';
  private static readonly MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_BLOCK_NODE_ENDPOINTS: string = '0.157.0-0';
  public constructor(
    @inject(InjectTokens.PostgresSharedResource) private readonly postgresSharedResource: PostgresSharedResource,
    @inject(InjectTokens.SharedResourceManager) private readonly sharedResourceManager: SharedResourceManager,
    @inject(InjectTokens.AccountManager) private readonly accountManager?: AccountManager,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus?: SoloEventBus,
  ) {
    super();

    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.postgresSharedResource = patchInject(
      postgresSharedResource,
      InjectTokens.PostgresSharedResource,
      this.constructor.name,
    );
    this.sharedResourceManager = patchInject(
      sharedResourceManager,
      InjectTokens.SharedResourceManager,
      this.constructor.name,
    );
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'upgradeConfigs';

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.cacheDir,
      flags.chartDirectory,
      flags.mirrorNodeChartDirectory,
      flags.clusterRef,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.mirrorStaticIp,
      flags.quiet,
      flags.valuesFile,
      flags.mirrorNodeVersion,
      flags.componentImage,
      flags.componentImageArchive,
      flags.pinger,
      flags.useExternalDatabase,
      flags.operatorId,
      flags.operatorKey,
      flags.storageType,
      flags.storageReadAccessKey,
      flags.storageReadSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
      flags.storageBucketPrefix,
      flags.storageBucketRegion,
      flags.externalDatabaseHost,
      flags.externalDatabaseOwnerUsername,
      flags.externalDatabaseOwnerPassword,
      flags.externalDatabaseReadonlyUsername,
      flags.externalDatabaseReadonlyPassword,
      flags.domainName,
      flags.forcePortForward,
      flags.externalAddress,
      flags.soloChartVersion,
      flags.forceBlockNodeIntegration, // Used to bypass version requirements for block node integration
      flags.parallelDeploy,
    ],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.clusterRef,
      flags.cacheDir,
      flags.chartDirectory,
      flags.mirrorNodeChartDirectory,
      flags.enableIngress,
      flags.ingressControllerValueFile,
      flags.mirrorStaticIp,
      flags.quiet,
      flags.valuesFile,
      flags.mirrorNodeVersion,
      flags.componentImage,
      flags.componentImageArchive,
      flags.pinger,
      flags.useExternalDatabase,
      flags.operatorId,
      flags.operatorKey,
      flags.storageType,
      flags.storageReadAccessKey,
      flags.storageReadSecrets,
      flags.storageEndpoint,
      flags.storageBucket,
      flags.storageBucketPrefix,
      flags.storageBucketRegion,
      flags.externalDatabaseHost,
      flags.externalDatabaseOwnerUsername,
      flags.externalDatabaseOwnerPassword,
      flags.externalDatabaseReadonlyUsername,
      flags.externalDatabaseReadonlyPassword,
      flags.domainName,
      flags.forcePortForward,
      flags.externalAddress,
      flags.id,
      flags.soloChartVersion,
      flags.forceBlockNodeIntegration, // Used to bypass version requirements for block node integration
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.chartDirectory,
      flags.clusterRef,
      flags.force,
      flags.quiet,
      flags.debugMode,
      flags.id,
    ],
  };

  private prepareBlockNodeIntegrationValues(
    config: MirrorNodeUpgradeConfigClass | MirrorNodeDeployConfigClass,
  ): HelmChartValues {
    const configuration: RemoteConfig = this.remoteConfig.configuration;
    const blockNodeSchemas: ReadonlyArray<Readonly<BlockNodeStateSchema>> = configuration.components.state.blockNodes;
    const sameClusterBlockNodeSchemas: ReadonlyArray<Readonly<BlockNodeStateSchema>> = blockNodeSchemas.filter(
      (blockNode): boolean => blockNode.metadata.cluster === config.clusterReference,
    );

    if (blockNodeSchemas.length === 0) {
      this.logger.debug('No block nodes found in remote config configuration');
      return new HelmChartValues();
    }

    if (sameClusterBlockNodeSchemas.length === 0) {
      this.logger.info(
        `Skipping block node integration for mirror node cluster ${config.clusterReference}; no block node in the same cluster`,
      );
      return new HelmChartValues();
    }

    if (!config.forceBlockNodeIntegration && configuration.state?.tssEnabled === false) {
      this.logger.info(
        `Mirror node will remain configured to pull from consensus node; TSS is disabled in deployment ${config.deployment}`,
      );
      return new HelmChartValues();
    }

    const hasSupportedConsensusNodeVersion: boolean =
      this.remoteConfig.configuration.versions.consensusNode.greaterThanOrEqual(
        versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS,
      );

    if (!config.forceBlockNodeIntegration && !hasSupportedConsensusNodeVersion) {
      this.logger.info(
        `Mirror node will remain configured to pull from consensus node; consensus node version must be at least ${versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS} or use ${optionFromFlag(flags.forceBlockNodeIntegration)} to enable block node integration`,
      );
      return new HelmChartValues();
    }

    if (config.forceBlockNodeIntegration && !hasSupportedConsensusNodeVersion) {
      this.logger.warn('Force flag enabled, bypassing version checks for block node integration');
    }

    if (!config.forceBlockNodeIntegration && constants.DISABLE_IMPORTER_SPRING_PROFILES) {
      this.logger.info(
        'Mirror node will remain configured to pull from consensus node; DISABLE_IMPORTER_SPRING_PROFILES=true disables automatic block node integration',
      );
      return new HelmChartValues();
    } else if (constants.DISABLE_IMPORTER_SPRING_PROFILES) {
      this.logger.showUser(
        `DISABLE_IMPORTER_SPRING_PROFILES=true is set, but ${optionFromFlag(flags.forceBlockNodeIntegration)} overrides it; injecting SPRING_PROFILES_ACTIVE for block node integration`,
      );
    }

    const clusterSchemas: ReadonlyArray<Readonly<ClusterSchema>> = configuration.clusters;

    this.logger.debug('Preparing mirror node values args overrides for block nodes integration');

    const blockNodeFqdnList: {host: string; port: number}[] = [];

    for (const blockNode of sameClusterBlockNodeSchemas) {
      const id: ComponentId = blockNode.metadata.id;
      const clusterReference: ClusterReferenceName = blockNode.metadata.cluster;

      const cluster: Readonly<ClusterSchema> = clusterSchemas.find(
        (cluster): boolean => cluster.name === clusterReference,
      );

      if (!cluster) {
        throw new SoloErrors.system.clusterNotFoundInRemoteConfig(clusterReference);
      }

      const serviceName: string = Templates.renderBlockNodeName(id);
      const namespace: NamespaceNameAsString = blockNode.metadata.namespace;
      const dnsBaseDomain: string = cluster.dnsBaseDomain;

      const fqdn: string = Templates.renderSvcFullyQualifiedDomainName(serviceName, namespace, dnsBaseDomain);

      blockNodeFqdnList.push({
        host: fqdn,
        port: constants.BLOCK_NODE_PORT,
      });
    }

    const data: {SPRING_PROFILES_ACTIVE?: string} & Record<string, string | number> = {};
    const usesBlockNodeEndpoints: boolean = new SemanticVersion<string>(config.mirrorNodeVersion).greaterThanOrEqual(
      MirrorNodeCommand.MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_BLOCK_NODE_ENDPOINTS,
    );

    if (config.forceBlockNodeIntegration || !constants.DISABLE_IMPORTER_SPRING_PROFILES) {
      if (config.forceBlockNodeIntegration && constants.DISABLE_IMPORTER_SPRING_PROFILES) {
        this.logger.showUser(
          `DISABLE_IMPORTER_SPRING_PROFILES=true is set, but ${optionFromFlag(flags.forceBlockNodeIntegration)} overrides it; injecting SPRING_PROFILES_ACTIVE for block node integration`,
        );
      }
      data.SPRING_PROFILES_ACTIVE = constants.SPRING_PROFILES_ACTIVE;
    }

    const importerConfig: {
      [key: string]: {
        mirror: {
          importer: {
            block?: {
              nodes: {
                endpoints: {
                  host: string;
                  port: number;
                }[];
              }[];
            };
            downloader: {
              balance: {
                enabled: boolean;
              };
              record: {
                enabled: boolean;
              };
            };
          };
        };
      };
    } = {
      [MirrorNodeCommand.MIRROR_CHART_NAMESPACE]: {
        mirror: {
          importer: {
            downloader: {
              balance: {
                enabled: false,
              },
              record: {
                enabled: false,
              },
            },
          },
        },
      },
    };

    if (usesBlockNodeEndpoints) {
      importerConfig[MirrorNodeCommand.MIRROR_CHART_NAMESPACE].mirror.importer.block = {
        nodes: blockNodeFqdnList.map(
          (
            node,
          ): {
            endpoints: {
              host: string;
              port: number;
            }[];
          } => ({
            endpoints: [
              {
                host: node.host,
                port: node.port,
              },
            ],
          }),
        ),
      };
    }

    for (const [index, node] of blockNodeFqdnList.entries()) {
      if (usesBlockNodeEndpoints) {
        continue;
      }

      const blockNodeVariablePrefix: string = `HIERO_MIRROR_IMPORTER_BLOCK_NODES_${index}`;

      data[`${blockNodeVariablePrefix}_HOST`] = node.host;
      if (node.port !== constants.BLOCK_NODE_PORT) {
        data[`${blockNodeVariablePrefix}_PORT`] = node.port;
      }
    }

    const mirrorNodeBlockNodeValues: {
      importer: {
        env: {SPRING_PROFILES_ACTIVE?: string} & Record<string, string | number>;
        config: typeof importerConfig;
      };
    } = {
      importer: {
        env: data,
        config: importerConfig,
      },
    };

    const mirrorNodeBlockNodeValuesYaml: string = yaml.stringify(mirrorNodeBlockNodeValues);

    const valuesFilePath: string = PathEx.join(config.cacheDir, 'mirror-bn-values.yaml');

    fs.writeFileSync(valuesFilePath, mirrorNodeBlockNodeValuesYaml);

    return new HelmChartValues().file(valuesFilePath);
  }

  private async prepareHelmChartValues(
    config: MirrorNodeDeployConfigClass | MirrorNodeUpgradeConfigClass,
  ): Promise<HelmChartValues> {
    const chartValues: HelmChartValues = new HelmChartValues();

    chartValues.filesFromCommaSeparatedInput(config.valuesFile);
    chartValues.add(HelmSchedulingValues.buildSchedulingChartValues(chartValues, 'pinger', 'pinger'));

    config.mirrorNodeVersion = SemanticVersion.getValidSemanticVersion(
      config.mirrorNodeVersion,
      true,
      'Mirror node version',
    );

    const chartNamespace: string = MirrorNodeCommand.MIRROR_CHART_NAMESPACE;
    const environmentVariablePrefix: string = MirrorNodeCommand.MIRROR_ENVIRONMENT_VARIABLE_PREFIX;

    if (config.componentImage) {
      const parsedImageReference: ParsedImageReference = ImageReference.parseImageReference(config.componentImage);
      chartValues
        .setLiteral('importer.image.registry', parsedImageReference.registry)
        .setLiteral('grpc.image.registry', parsedImageReference.registry)
        .setLiteral('rest.image.registry', parsedImageReference.registry)
        .setLiteral('restjava.image.registry', parsedImageReference.registry)
        .setLiteral('web3.image.registry', parsedImageReference.registry)
        .setLiteral('monitor.image.registry', parsedImageReference.registry)
        .setLiteral('importer.image.repository', parsedImageReference.repository)
        .setLiteral('grpc.image.repository', parsedImageReference.repository)
        .setLiteral('rest.image.repository', parsedImageReference.repository)
        .setLiteral('restjava.image.repository', parsedImageReference.repository)
        .setLiteral('web3.image.repository', parsedImageReference.repository)
        .setLiteral('monitor.image.repository', parsedImageReference.repository)
        .setLiteral('importer.image.tag', parsedImageReference.tag)
        .setLiteral('grpc.image.tag', parsedImageReference.tag)
        .setLiteral('rest.image.tag', parsedImageReference.tag)
        .setLiteral('restjava.image.tag', parsedImageReference.tag)
        .setLiteral('web3.image.tag', parsedImageReference.tag)
        .setLiteral('monitor.image.tag', parsedImageReference.tag);

      if (this.isComponentImageAvailableForKind(config.componentImage, config.componentImageArchive)) {
        chartValues
          .setLiteral('importer.image.pullPolicy', 'Never')
          .setLiteral('grpc.image.pullPolicy', 'Never')
          .setLiteral('rest.image.pullPolicy', 'Never')
          .setLiteral('restjava.image.pullPolicy', 'Never')
          .setLiteral('web3.image.pullPolicy', 'Never')
          .setLiteral('monitor.image.pullPolicy', 'Never');
      }
    } else if (this.shouldApplyMirrorNodeImageTagOverrides(config.mirrorNodeChartDirectory)) {
      this.addMirrorNodeImageTagOverrides(chartValues, config.mirrorNodeVersion);
    }

    if (config.storageBucket) {
      chartValues.setLiteral(
        `importer.config.${chartNamespace}.mirror.importer.downloader.bucketName`,
        config.storageBucket,
      );
    }
    if (config.storageBucketPrefix) {
      this.logger.info(`Setting storage bucket prefix to ${config.storageBucketPrefix}`);
      chartValues.setLiteral(
        `importer.config.${chartNamespace}.mirror.importer.downloader.pathPrefix`,
        config.storageBucketPrefix,
      );
    }

    let storageType: string = '';
    if (
      config.storageType !== constants.StorageType.MINIO_ONLY &&
      config.storageReadAccessKey &&
      config.storageReadSecrets &&
      config.storageEndpoint
    ) {
      if (
        config.storageType === constants.StorageType.GCS_ONLY ||
        config.storageType === constants.StorageType.AWS_AND_GCS
      ) {
        storageType = 'gcp';
      } else if (config.storageType === constants.StorageType.AWS_ONLY) {
        storageType = 's3';
      } else {
        throw new SoloErrors.validation.illegalArgument(`Invalid cloud storage type: ${config.storageType}`);
      }

      chartValues
        .setLiteral(`importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_CLOUDPROVIDER`, storageType)
        .setLiteral(
          `importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_ENDPOINTOVERRIDE`,
          config.storageEndpoint,
        )
        .setLiteral(
          `importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_ACCESSKEY`,
          config.storageReadAccessKey,
        )
        .setLiteral(
          `importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_SECRETKEY`,
          config.storageReadSecrets,
        );
    }

    if (config.storageBucketRegion) {
      chartValues.setLiteral(
        `importer.env.${environmentVariablePrefix}_MIRROR_IMPORTER_DOWNLOADER_REGION`,
        config.storageBucketRegion,
      );
    }

    if (config.domainName) {
      chartValues
        .set('ingress.enabled', true)
        .set('ingress.tls.enabled', false)
        .setLiteral('ingress.hosts[0].host', config.domainName);
    }

    // if the useExternalDatabase populate all the required values before installing the chart
    let host: string, ownerPassword: string, ownerUsername: string, readonlyPassword: string, readonlyUsername: string;
    chartValues
      // Disable default database deployment
      .set('stackgres.enabled', false)
      .set('postgresql.enabled', false)
      .setLiteral('db.name', 'mirror_node');

    if (config.useExternalDatabase) {
      host = config.externalDatabaseHost;
      ownerPassword = config.externalDatabaseOwnerPassword;
      ownerUsername = config.externalDatabaseOwnerUsername;
      readonlyUsername = config.externalDatabaseReadonlyUsername;
      readonlyPassword = config.externalDatabaseReadonlyPassword;

      chartValues
        // Set the host and name
        .setLiteral('db.host', host)

        // set the usernames
        .setLiteral('db.owner.username', ownerUsername)
        .setLiteral('importer.db.username', ownerUsername)

        .setLiteral('grpc.db.username', readonlyUsername)
        .setLiteral('restjava.db.username', readonlyUsername)
        .setLiteral('web3.db.username', readonlyUsername)

        // TODO: Fixes a problem where importer's V1.0__Init.sql migration fails
        // 'rest.db.username': readonlyUsername,

        // set the passwords
        .setLiteral('db.owner.password', ownerPassword)
        .setLiteral('importer.db.password', ownerPassword)

        .setLiteral('grpc.db.password', readonlyPassword)
        .setLiteral('restjava.db.password', readonlyPassword)
        .setLiteral('web3.db.password', readonlyPassword)
        .setLiteral('rest.db.password', readonlyPassword);
    } else {
      chartValues.setLiteral('db.host', `solo-shared-resources-postgres.${config.namespace.name}.svc.cluster.local`);
    }

    chartValues.add(this.prepareBlockNodeIntegrationValues(config));

    return chartValues;
  }

  /**
   * A local/custom chart directory (`--mirror-node-chart-dir`) may carry its own SNAPSHOT image
   * tags (e.g. for testing a locally built mirror node image). Forcing the tag to the resolved
   * `mirrorNodeVersion` in that case would clobber the chart's own default, so the override is
   * skipped unless the user explicitly requested a version. See issue #5892.
   */
  private shouldApplyMirrorNodeImageTagOverrides(mirrorNodeChartDirectory: string): boolean {
    return !mirrorNodeChartDirectory || this.configManager.wasFlagProvidedByUser(flags.mirrorNodeVersion);
  }

  private addMirrorNodeImageTagOverrides(chartValues: HelmChartValues, mirrorNodeVersion: string): void {
    const imageTag: string = mirrorNodeVersion.replace(/^v/, '');
    chartValues
      .setLiteral('grpc.image.tag', imageTag)
      .setLiteral('importer.image.tag', imageTag)
      .setLiteral('monitor.image.tag', imageTag)
      .setLiteral('pinger.image.tag', imageTag)
      .setLiteral('rest.image.tag', imageTag)
      .setLiteral('restjava.image.tag', imageTag)
      .setLiteral('web3.image.tag', imageTag);
  }

  private shouldReuseValuesOnUpgrade(
    currentVersion: SemanticVersion<string> | null,
    targetVersion: string,
    commandType: MirrorNodeCommandType,
  ): boolean {
    if (commandType === MirrorNodeCommandType.ADD || currentVersion === null) {
      return false;
    }

    const targetSemanticVersion: SemanticVersion<string> = new SemanticVersion<string>(targetVersion);

    // Don't reuse values when crossing the shared-resources/memory-improvements boundary
    // (upgrading from < v0.152.0 to >= v0.152.0). Versions before this boundary used an
    // embedded chart-managed Redis with sentinel nodes pointed at "<release>-redis".
    // Reusing those old values would leak stale SPRING_DATA_REDIS_SENTINEL_NODES into the
    // upgraded pods because --reuse-values merges all old chart values.
    if (
      currentVersion.lessThan(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION) &&
      targetSemanticVersion.greaterThanOrEqual(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION)
    ) {
      return false;
    }

    // Mirror node v0.157.0 changed block node importer properties from nodes[].host/port
    // to nodes[].endpoints[].host/port. Reusing values across this boundary preserves the
    // old env vars, and the importer fails strict binding with those stale keys.
    if (
      currentVersion.lessThan(MirrorNodeCommand.MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_BLOCK_NODE_ENDPOINTS) &&
      targetSemanticVersion.greaterThanOrEqual(
        MirrorNodeCommand.MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_BLOCK_NODE_ENDPOINTS,
      )
    ) {
      return false;
    }

    return true;
  }

  /** Upgrades the mirror node chart with bounded retries to ride out transient API server outages. */
  private async upgradeMirrorNodeChart(
    config: MirrorNodeDeployConfigClass | MirrorNodeUpgradeConfigClass,
    shouldReuseValues: boolean,
  ): Promise<void> {
    for (let attempt: number = 1; attempt <= constants.MIRROR_NODE_CHART_UPGRADE_MAX_ATTEMPTS; attempt++) {
      try {
        await this.chartManager.upgrade(
          config.namespace,
          config.releaseName,
          constants.MIRROR_NODE_CHART,
          config.mirrorNodeChartDirectory || constants.MIRROR_NODE_RELEASE_NAME,
          config.mirrorNodeVersion,
          config.chartValues,
          config.clusterContext,
          shouldReuseValues,
          true,
          false,
          Boolean(config.mirrorNodeChartDirectory),
        );
        return;
      } catch (error) {
        if (attempt === constants.MIRROR_NODE_CHART_UPGRADE_MAX_ATTEMPTS) {
          throw error;
        }

        this.logger.warn(
          `Attempt ${attempt} of ${constants.MIRROR_NODE_CHART_UPGRADE_MAX_ATTEMPTS} to upgrade chart ` +
            `'${config.releaseName}' failed, retrying in ` +
            `${constants.MIRROR_NODE_CHART_UPGRADE_RETRY_DELAY_SECS} seconds`,
          error,
        );
        await sleep(Duration.ofSeconds(constants.MIRROR_NODE_CHART_UPGRADE_RETRY_DELAY_SECS));

        if (!config.isChartInstalled) {
          try {
            // remove the release left behind by the failed fresh install so the retry starts from a clean state
            await this.chartManager.uninstall(config.namespace, config.releaseName, config.clusterContext);
          } catch (uninstallError) {
            // best-effort cleanup: a persistent failure will surface on the next upgrade attempt
            this.logger.warn(`Failed to uninstall chart '${config.releaseName}' before retry`, uninstallError);
          }
        }
      }
    }
  }

  private async deployMirrorNode(
    {config}: MirrorNodeDeployContext | MirrorNodeUpgradeContext,
    commandType: MirrorNodeCommandType,
  ): Promise<void> {
    const currentVersion: SemanticVersion<string> | null = this.remoteConfig.getComponentVersion(
      ComponentTypes.MirrorNode,
    );
    const shouldReuseValues: boolean = this.shouldReuseValuesOnUpgrade(
      currentVersion,
      config.mirrorNodeVersion,
      commandType,
    );

    await this.loadComponentImage(config.componentImage, config.componentImageArchive, config.clusterContext);

    await this.upgradeMirrorNodeChart(config, shouldReuseValues);

    this.eventBus.emit(new MirrorNodeDeployedEvent(config.deployment));

    showVersionBanner(this.logger, constants.MIRROR_NODE_RELEASE_NAME, config.mirrorNodeVersion);

    if (commandType === MirrorNodeCommandType.ADD) {
      this.remoteConfig.configuration.components.changeComponentPhase(
        (config as MirrorNodeDeployConfigClass).newMirrorNodeComponent.metadata.id,
        ComponentTypes.MirrorNode,
        DeploymentPhase.DEPLOYED,
      );

      // update mirror node version in remote config after successful deployment
      this.remoteConfig.updateComponentVersion(
        ComponentTypes.MirrorNode,
        new SemanticVersion<string>(config.mirrorNodeVersion),
      );

      await this.remoteConfig.persist();
    } else if (commandType === MirrorNodeCommandType.UPGRADE) {
      // update mirror node version in remote config after successful upgrade
      this.remoteConfig.updateComponentVersion(
        ComponentTypes.MirrorNode,
        new SemanticVersion<string>(config.mirrorNodeVersion),
      );

      await this.remoteConfig.persist();
    }

    if (config.enableIngress) {
      const existingIngressClasses: IngressClass[] = await this.k8Factory
        .getK8(config.clusterContext)
        .ingressClasses()
        .list();

      let mirrorIngressClassExists: boolean = false;
      for (const ingressClass of existingIngressClasses) {
        this.logger.debug(`Found existing IngressClass [${ingressClass.name}]`);
        if (ingressClass.name === constants.MIRROR_INGRESS_CLASS_NAME) {
          mirrorIngressClassExists = true;
          break;
        }
      }

      // TLS secret is namespace-scoped: always create it so the ingress can reference it,
      // even when the cluster-scoped IngressClass already exists.
      await KeyManager.createTlsSecret(
        this.k8Factory,
        config.namespace,
        config.domainName,
        config.cacheDir,
        constants.MIRROR_INGRESS_TLS_SECRET_NAME,
      );

      // patch ingressClassName of mirror ingress, so it can be recognized by haproxy ingress controller
      const k8: K8 = this.k8Factory.getK8(config.clusterContext);
      const tlsSpec: object = {
        spec: {
          ingressClassName: `${constants.MIRROR_INGRESS_CLASS_NAME}`,
          tls: [
            {
              hosts: [config.domainName || 'localhost'],
              secretName: constants.MIRROR_INGRESS_TLS_SECRET_NAME,
            },
          ],
        },
      };

      // First pass: set ingressClassName, TLS, and path-type 'prefix' on all mirror ingresses.
      // 'prefix' puts the Node.js REST catch-all path /api/v1 into HAProxy's prefix map.
      await k8.ingresses().update(config.namespace, constants.MIRROR_NODE_RELEASE_NAME, {
        ...tlsSpec,
        metadata: {annotations: {'haproxy-ingress.github.io/path-type': 'prefix'}},
      });

      // Second pass: override path-type back to 'regex' for ingresses that have complex
      for (const suffix of ['-restjava', '-web3']) {
        await k8.ingresses().update(config.namespace, suffix, {
          metadata: {annotations: {'haproxy-ingress.github.io/path-type': 'regex'}},
        });
      }

      if (!mirrorIngressClassExists) {
        await this.k8Factory
          .getK8(config.clusterContext)
          .ingressClasses()
          .create(
            constants.MIRROR_INGRESS_CLASS_NAME,
            constants.INGRESS_CONTROLLER_PREFIX + constants.MIRROR_INGRESS_CONTROLLER,
          );
      }
    }
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.MirrorNode),
    );
  }

  private getIngressReleaseName(): string {
    return this.renderIngressReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.MirrorNode),
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloErrors.validation.mirrorNodeInvalidComponentId(id);
    }
    return `${constants.MIRROR_NODE_RELEASE_NAME}-${id}`;
  }

  private renderIngressReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloErrors.validation.mirrorNodeInvalidComponentId(id);
    }
    return `${constants.INGRESS_CONTROLLER_RELEASE_NAME}-${id}`;
  }

  private enableSharedResourcesTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable shared resources',
      task: async (_, task): Promise<SoloListr<AnyListrContext>> => {
        const subTasks: SoloListrTask<AnyListrContext>[] = [
          {
            title: 'Install Shared Resources chart',
            task: async (context_): Promise<void> => {
              if (!context_.config.useExternalDatabase) {
                this.sharedResourceManager.enablePostgres();
              }

              this.sharedResourceManager.enableRedis();
              this.sharedResourceManager.setSchedulingChartValues(context_.config.chartValues);
              context_.config.installSharedResources = await this.sharedResourceManager.installChart(
                context_.config.namespace,
                context_.config.chartDirectory,
                context_.config.soloChartVersion,
                context_.config.clusterContext,
                {
                  'redis.image.registry': constants.REDIS_IMAGE_REGISTRY,
                  'redis.image.repository': constants.REDIS_IMAGE_REPOSITORY,
                  'redis.image.tag': versions.REDIS_IMAGE_VERSION,
                  'redis.sentinel.image.registry': constants.REDIS_SENTINEL_IMAGE_REGISTRY,
                  'redis.sentinel.image.repository': constants.REDIS_SENTINEL_IMAGE_REPOSITORY,
                  'redis.sentinel.image.tag': versions.REDIS_SENTINEL_IMAGE_VERSION,
                  'redis.sentinel.masterSet': constants.REDIS_SENTINEL_MASTER_SET,
                },
              );
            },
          },
          {
            title: 'Load redis credentials',
            task: async (context_): Promise<void> => {
              const secrets: Secret[] = await this.k8Factory
                .getK8(context_.config.clusterContext)
                .secrets()
                .list(context_.config.namespace, ['app.kubernetes.io/instance=solo-shared-resources']);
              const secret: Secret = secrets.find(
                (secret: Secret): boolean => secret.name === 'solo-shared-resources-redis',
              );

              // Update values
              context_.config.chartValues
                .set('redis.enabled', false)
                .setLiteral('redis.auth.password', Base64.decode(secret.data['SPRING_DATA_REDIS_PASSWORD']))
                .setLiteral('redis.host', Base64.decode(secret.data['SPRING_DATA_REDIS_HOST']))
                .setLiteral('redis.port', Base64.decode(secret.data['SPRING_DATA_REDIS_PORT']));
            },
          },
          {
            title: 'Initialize Postgres pod',
            task: (_context_, task): SoloListr<MirrorNodeDeployContext> => {
              const subTasks: SoloListrTask<MirrorNodeDeployContext>[] = [
                {
                  title: 'Wait for Postgres pod to be ready',
                  task: async (context_): Promise<void> => {
                    await this.postgresSharedResource.waitForPodReady(
                      context_.config.namespace,
                      context_.config.clusterContext,
                    );
                  },
                },
              ];

              // set up the sub-tasks
              return task.newListr(subTasks, {
                concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
                rendererOptions: {
                  collapseSubtasks: false,
                },
              });
            },
            skip: (context_): boolean => context_.config.useExternalDatabase,
          },
          {
            title: 'Add shared resource components to remote config',
            skip: (context_): boolean => !context_.config.installSharedResources || !this.remoteConfig.isLoaded(),
            task: async (context_): Promise<void> => {
              if (!context_.config.useExternalDatabase) {
                const postgresComponent: PostgresStateSchema = this.componentFactory.createNewPostgresComponent(
                  context_.config.clusterReference,
                  context_.config.namespace,
                );
                this.remoteConfig.configuration.components.addNewComponent(postgresComponent, ComponentTypes.Postgres);
              }
              const redisComponent: RedisStateSchema = this.componentFactory.createNewRedisComponent(
                context_.config.clusterReference,
                context_.config.namespace,
              );
              this.remoteConfig.configuration.components.addNewComponent(redisComponent, ComponentTypes.Redis);
              await this.remoteConfig.persist();
            },
          },
        ];

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

  private initializeSharedPostgresDatabaseTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Run database initialization script',
      task: async (context_): Promise<void> => {
        await this.postgresSharedResource.initializeMirrorNode(
          context_.config.namespace,
          context_.config.clusterContext,
          MirrorNodeCommand.MIRROR_ENVIRONMENT_VARIABLE_PREFIX,
        );
      },
      skip: ({config}: MirrorNodeDeployContext): boolean => config.useExternalDatabase,
    };
  }

  /**
   * Deletes the `<release>-redis` secret so that the subsequent mirror chart install/upgrade
   * re-creates it cleanly.  This is necessary because Kubernetes strategic-merge-patch does not
   * remove keys — stale `SPRING_DATA_REDIS_SENTINEL_NODES` values written by a previous install
   * (using the internal chart-managed Redis) would otherwise persist and cause pods to try to
   * resolve a non-existent hostname.
   */
  private deleteStaleRedisSecretTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Delete stale mirror redis secret',
      task: async (context_): Promise<void> => {
        // secrets().delete() returns true for NotFound, so no try/catch needed.
        await this.k8Factory
          .getK8(context_.config.clusterContext)
          .secrets()
          .delete(context_.config.namespace, `${context_.config.releaseName}-redis`);
      },
    };
  }

  /**
   * Installs the mirror chart with all application components disabled in order to create the
   * `mirror-passwords` secret.  The init script (run by {@link initializeSharedPostgresDatabaseTask})
   * reads that secret to obtain the DB user passwords, so the secret must exist before init runs.
   * The importer must not be running during init (it would hold a session that blocks DROP DATABASE),
   * so we use this lightweight prime install instead of a full chart install.
   */
  private primePostgresSecretTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Prime mirror-node postgres secret',
      task: async (context_): Promise<void> => {
        // Skip if the secret was already created by a previous install.
        const secretExists: boolean = await this.k8Factory
          .getK8(context_.config.clusterContext)
          .secrets()
          .exists(context_.config.namespace, 'mirror-passwords');
        if (secretExists) {
          return;
        }

        // Install the mirror chart with every application component disabled.  This is enough for
        // Helm to render and apply the `mirror-passwords` Secret template without starting any pods
        // that could connect to Postgres before the init script runs.
        //
        // redis.enabled must be false here: when true the chart writes SPRING_DATA_REDIS_SENTINEL_NODES
        // into the <release>-redis secret using the chart default host ({{ .Release.Name }}-redis).
        // Kubernetes strategic-merge-patch does not remove keys, so those stale sentinel values would
        // persist through the full upgrade (which sets redis.enabled=false and skips the sentinel block).
        // Setting redis.enabled=false in the prime install prevents the stale keys from ever being written.
        const primeChartValues: HelmChartValues = new HelmChartValues()
          .set('stackgres.enabled', false)
          .set('postgresql.enabled', false)
          .set('redis.enabled', false)
          .setLiteral('db.host', `solo-shared-resources-postgres.${context_.config.namespace.name}.svc.cluster.local`)
          .setLiteral('db.name', 'mirror_node')
          .set('importer.enabled', false)
          .set('grpc.enabled', false)
          .set('rest.enabled', false)
          .set('restjava.enabled', false)
          .set('web3.enabled', false)
          .set('rosetta.enabled', false)
          .set('graphql.enabled', false)
          .set('monitor.enabled', false);

        await this.chartManager.upgrade(
          context_.config.namespace,
          context_.config.releaseName,
          constants.MIRROR_NODE_CHART,
          context_.config.mirrorNodeChartDirectory || constants.MIRROR_NODE_RELEASE_NAME,
          context_.config.mirrorNodeVersion,
          primeChartValues,
          context_.config.clusterContext,
          false,
          true,
          false,
          Boolean(context_.config.mirrorNodeChartDirectory),
        );
      },
      skip: ({config}: MirrorNodeDeployContext): boolean => config.useExternalDatabase,
    };
  }

  private enableMirrorNodeTask(commandType: MirrorNodeCommandType): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable mirror-node',
      task: (_, parentTask): SoloListr<AnyListrContext> =>
        parentTask.newListr<MirrorNodeDeployContext>(
          [
            {
              title: 'Prepare address book',
              task: async (context_): Promise<void> => {
                if (this.oneShotState.isActive()) {
                  context_.addressBook = await this.accountManager.buildAddressBookBase64(context_.config.deployment);

                  context_.config.chartValues.setLiteral('importer.addressBook', context_.addressBook);
                } else {
                  const deployment: DeploymentName = this.configManager.getFlag(flags.deployment);
                  const portForward: boolean = this.configManager.getFlag(flags.forcePortForward);
                  context_.addressBook = await this.accountManager.prepareAddressBookBase64(
                    context_.config.namespace,
                    this.remoteConfig.getClusterRefs(),
                    deployment,
                    this.configManager.getFlag(flags.operatorId),
                    this.configManager.getFlag(flags.operatorKey),
                    portForward,
                  );
                  context_.config.chartValues.setLiteral('importer.addressBook', context_.addressBook);
                }
              },
            },
            {
              title: 'Install mirror ingress controller',
              task: async (context_): Promise<void> => {
                const config: MirrorNodeDeployConfigClass = context_.config;

                const mirrorIngressControllerChartValues: HelmChartValues = new HelmChartValues().file(
                  constants.INGRESS_CONTROLLER_VALUES_FILE,
                );
                mirrorIngressControllerChartValues.add(
                  HelmSchedulingValues.buildSchedulingChartValues(config.chartValues, 'controller'),
                );
                if (config.mirrorStaticIp !== '') {
                  mirrorIngressControllerChartValues.setLiteral(
                    'controller.service.loadBalancerIP',
                    context_.config.mirrorStaticIp,
                  );
                }
                mirrorIngressControllerChartValues
                  .setLiteral('fullnameOverride', `${constants.MIRROR_INGRESS_CONTROLLER}-${config.namespace.name}`)
                  .setLiteral('controller.ingressClass', constants.MIRROR_INGRESS_CLASS_NAME)
                  .setLiteral('controller.extraArgs.controller-class', constants.MIRROR_INGRESS_CONTROLLER)
                  .filesFromCommaSeparatedInput(config.ingressControllerValueFile);

                await this.chartManager.upgrade(
                  config.namespace,
                  config.ingressReleaseName,
                  constants.INGRESS_CONTROLLER_RELEASE_NAME,
                  constants.INGRESS_CONTROLLER_RELEASE_NAME,
                  INGRESS_CONTROLLER_VERSION,
                  mirrorIngressControllerChartValues,
                  context_.config.clusterContext,
                  false,
                  true,
                );
                await this.adoptMirrorIngressControllerRbacOwnership(config);
                showVersionBanner(this.logger, config.ingressReleaseName, INGRESS_CONTROLLER_VERSION);
              },
              skip: (context_): boolean => !context_.config.enableIngress,
            },
            {
              title: 'Deploy mirror-node',
              task: async (context_): Promise<void> => {
                await this.deployMirrorNode(context_, commandType);
              },
            },
            this.waitForMirrorNodeSchemaTask(),
          ],
          constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
        ),
    };
  }

  /**
   * Waits for the importer to become ready — and thus for its Flyway schema migrations to complete —
   * before dependent components are health-checked. Without this gate, a slow first-run schema build
   * lets REST/REST-Java/Web3/gRPC query a partially-migrated database and fail the deployment.
   */
  private waitForMirrorNodeSchemaTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Wait for mirror node database schema',
      task: async (context_): Promise<void> => {
        const config: MirrorNodeDeployConfigClass | MirrorNodeUpgradeConfigClass = context_.config;
        const importerLabels: string[] = [
          'app.kubernetes.io/component=importer',
          `app.kubernetes.io/instance=${config.releaseName}`,
        ];
        const pods: Pods = this.k8Factory.getK8(config.clusterContext).pods();

        try {
          await pods.waitForRunningPhase(
            config.namespace,
            importerLabels,
            constants.MIRROR_NODE_IMPORTER_DETECT_MAX_ATTEMPTS,
            constants.MIRROR_NODE_IMPORTER_DETECT_DELAY,
          );
        } catch {
          // importer disabled via custom values — no schema build to wait for
          this.logger.info(`No importer pod found for release ${config.releaseName}; skipping mirror node schema wait`);
          return;
        }

        await pods.waitForReadyStatus(
          config.namespace,
          importerLabels,
          constants.MIRROR_NODE_SCHEMA_READY_MAX_ATTEMPTS,
          constants.MIRROR_NODE_SCHEMA_READY_DELAY,
        );
      },
    };
  }

  private checkPodsAreReadyNodeTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check pods are ready',
      task: async (context_, task): Promise<SoloListr<MirrorNodeDeployContext | MirrorNodeUpgradeContext>> => {
        const instanceCandidates: string[] = [
          this.renderReleaseName(context_.config.id), // e.g. mirror-1
          context_.config.releaseName,
        ];
        if (context_.config.id === 1) {
          instanceCandidates.push(constants.MIRROR_NODE_RELEASE_NAME); // legacy release name
        }

        const podsInAllNamespaces: Pod[] = [];
        for (const instanceName of new Set(instanceCandidates)) {
          const candidatePods: Pod[] = await this.k8Factory
            .getK8(context_.config.clusterContext)
            .pods()
            .listForAllNamespaces([`app.kubernetes.io/instance=${instanceName}`]);
          podsInAllNamespaces.push(...candidatePods);
        }

        const podsClient: Pods = this.k8Factory.getK8(context_.config.clusterContext).pods();
        const namespacePodReferences: PodReference[] = [
          ...new Map(
            podsInAllNamespaces
              .filter((pod): boolean => pod.podReference?.namespace?.name === context_.config.namespace.name)
              .map((pod): [string, PodReference] => [
                `${pod.podReference.namespace.name}/${pod.podReference.name.name}`,
                pod.podReference,
              ]),
          ).values(),
        ];
        const namespacePods: Pod[] = await Promise.all(
          namespacePodReferences.map(
            async (podReference: PodReference): Promise<Pod> => await podsClient.read(podReference),
          ),
        );

        const deployedPods: Pod[] = namespacePods.filter(
          (pod): boolean => !!pod.labels?.['app.kubernetes.io/component'] && !!pod.labels?.['app.kubernetes.io/name'],
        );

        if (deployedPods.length === 0) {
          throw new SoloErrors.system.mirrorNodePodsNotFound(
            context_.config.releaseName,
            context_.config.namespace.name,
          );
        }

        const checksBySelector: Map<string, {title: string; labels: string[]}> = new Map();
        for (const pod of deployedPods) {
          const component: string = pod.labels?.['app.kubernetes.io/component'];
          const name: string = pod.labels?.['app.kubernetes.io/name'];
          const key: string = `${component}|${name}`;
          if (!checksBySelector.has(key)) {
            const titleName: string = component
              .split('-')
              .map((word: string): string => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            checksBySelector.set(key, {
              title: `Check ${titleName}`,
              labels: [
                `app.kubernetes.io/component=${component}`,
                `app.kubernetes.io/name=${name}`,
                `app.kubernetes.io/instance=${pod.labels?.['app.kubernetes.io/instance']}`,
              ],
            });
          }
        }

        const subTasks: SoloListrTask<MirrorNodeDeployContext | MirrorNodeUpgradeContext>[] = [
          ...checksBySelector.values(),
        ].map(
          ({
            title,
            labels,
          }: {
            title: string;
            labels: string[];
          }): SoloListrTask<MirrorNodeDeployContext | MirrorNodeUpgradeContext> => {
            // The pinger is the last component to become ready because it depends on the
            // consensus network processing transactions and the mirror REST API ingesting
            // them.  On Windows/WSL2 this can take significantly longer than the default.
            const isPinger: boolean = labels.includes('app.kubernetes.io/component=pinger');
            return {
              title,
              task: async (): Promise<Pod[]> =>
                await this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .pods()
                  .waitForReadyStatus(
                    context_.config.namespace,
                    labels,
                    isPinger ? constants.MIRROR_NODE_PINGER_PODS_READY_MAX_ATTEMPTS : constants.PODS_READY_MAX_ATTEMPTS,
                    isPinger ? constants.MIRROR_NODE_PINGER_PODS_READY_DELAY : constants.PODS_READY_DELAY,
                  ),
            };
          },
        );

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  /**
   * Enables the mirror node pinger on an already-deployed mirror node via a lightweight
   * reuse-values helm upgrade: only `pinger.enabled` is flipped on, so the pinger.env.* values
   * baked in during the initial install are preserved. Used by the one-shot orchestrator to
   * defer the pinger until {@link SoloEventType.NodesStarted}, so it does not race the consensus
   * node start during a parallel deploy (which crashes the pinger's SDK client against a network
   * that is not yet serving transactions). The pinger pod is awaited until ready.
   */
  public async enablePinger(namespace: NamespaceName, context: Context, deployment: DeploymentName): Promise<void> {
    await this.remoteConfig.load(namespace, context);

    const mirrorNodeVersion: SemanticVersion<string> | null = this.remoteConfig.getComponentVersion(
      ComponentTypes.MirrorNode,
    );

    if (
      !mirrorNodeVersion ||
      mirrorNodeVersion.lessThan(new SemanticVersion<string>(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION))
    ) {
      this.logger.info(`Mirror node version predates the Go pinger for deployment ${deployment}; nothing to enable`);
      return;
    }

    const {releaseName} = await this.inferDestroyData(namespace, context);

    this.logger.info(`Enabling mirror node pinger on release ${releaseName} for deployment ${deployment}`);

    await this.chartManager.upgrade(
      namespace,
      releaseName,
      constants.MIRROR_NODE_CHART,
      constants.MIRROR_NODE_RELEASE_NAME,
      mirrorNodeVersion?.toString() ?? '',
      new HelmChartValues().set('pinger.enabled', true),
      context,
      true, // reuse existing values so the deferred pinger configuration is retained
      true,
    );

    await this.k8Factory
      .getK8(context)
      .pods()
      .waitForReadyStatus(
        namespace,
        ['app.kubernetes.io/component=pinger', `app.kubernetes.io/instance=${releaseName}`],
        constants.PODS_READY_MAX_ATTEMPTS,
        constants.PODS_READY_DELAY,
      );
  }

  private enablePortForwardingTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for mirror ingress controller',
      skip: ({config}: MirrorNodeDeployContext): boolean => !config.forcePortForward || !config.enableIngress,
      task: async ({config}: MirrorNodeDeployContext): Promise<void> => {
        const externalAddress: string = this.configManager.getFlag<string>(flags.externalAddress);
        const pods: Pod[] = await this.k8Factory
          .getK8(config.clusterContext)
          .pods()
          .list(config.namespace, [`app.kubernetes.io/instance=${config.ingressReleaseName}`]);
        if (pods.length === 0) {
          throw new SoloErrors.system.mirrorIngressControllerPodNotFound();
        }
        let podReference: PodReference;
        for (const pod of pods) {
          if (pod?.podReference?.name?.name?.startsWith('mirror-ingress')) {
            podReference = pod.podReference;
            break;
          }
        }

        await this.remoteConfig.configuration.components.managePortForward(
          config.clusterReference,
          podReference,
          80, // Pod port
          constants.MIRROR_NODE_PORT, // Local port
          this.k8Factory.getK8(config.clusterContext),
          this.logger,
          ComponentTypes.MirrorNode,
          'Mirror ingress controller',
          config.isChartInstalled, // Reuse existing port if chart is already installed
          undefined,
          true, // persist: auto-restart on failure using persist-port-forward.js
          externalAddress,
        );
        await this.remoteConfig.persist();
      },
    };
  }

  public async add(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<MirrorNodeDeployContext> = this.taskList.newTaskList<MirrorNodeDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.loadRemoteConfigOrWarn(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
            this.configManager.update(argv);

            flags.disablePrompts(MirrorNodeCommand.DEPLOY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...MirrorNodeCommand.DEPLOY_FLAGS_LIST.required,
              ...MirrorNodeCommand.DEPLOY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: MirrorNodeDeployConfigClass = this.configManager.getConfig(
              MirrorNodeCommand.DEPLOY_CONFIGS_NAME,
              allFlags,
              [],
            ) as MirrorNodeDeployConfigClass;

            context_.config = config;

            const hasMirrorNodeMemoryImprovements: boolean = new SemanticVersion<string>(
              config.mirrorNodeVersion,
            ).greaterThanOrEqual(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION);

            config.namespace = await this.getNamespace(task);
            config.clusterReference = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterReference);

            config.newMirrorNodeComponent = this.componentFactory.createNewMirrorNodeComponent(
              config.clusterReference,
              config.namespace,
            );

            config.newMirrorNodeComponent.metadata.phase = DeploymentPhase.REQUESTED;

            config.id = config.newMirrorNodeComponent.metadata.id;
            config.installSharedResources = false;

            const useMirrorNodeLegacyReleaseName: boolean = process.env.USE_MIRROR_NODE_LEGACY_RELEASE_NAME === 'true';
            if (useMirrorNodeLegacyReleaseName) {
              config.releaseName = constants.MIRROR_NODE_RELEASE_NAME;
              config.ingressReleaseName = `${constants.INGRESS_CONTROLLER_RELEASE_NAME}-${config.namespace.name}`;
            } else {
              config.releaseName = this.getReleaseName();
              config.ingressReleaseName = this.getIngressReleaseName();
            }

            config.isChartInstalled = await this.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.clusterContext,
            );

            context_.config.soloChartVersion = SemanticVersion.getValidSemanticVersion(
              context_.config.soloChartVersion,
              false,
              'Solo chart version',
              versions.MINIMUM_SOLO_CHART_VERSION,
            );

            // predefined values first
            config.chartValues = new HelmChartValues().file(constants.MIRROR_NODE_VALUES_FILE);

            // user defined values later to override predefined values
            config.chartValues.add(await this.prepareHelmChartValues(config));

            config.deployment = this.configManager.getFlag(flags.deployment);

            const realm: Realm = this.localConfig.configuration.realmForDeployment(config.deployment);
            const shard: Shard = this.localConfig.configuration.shardForDeployment(config.deployment);
            const chartNamespace: string = MirrorNodeCommand.MIRROR_CHART_NAMESPACE;

            const modules: string[] = ['monitor', 'rest', 'grpc', 'importer', 'restjava', 'graphql', 'rosetta', 'web3'];

            for (const module of modules) {
              config.chartValues.set(`${module}.config.${chartNamespace}.mirror.common.realm`, +realm);
              config.chartValues.set(`${module}.config.${chartNamespace}.mirror.common.shard`, +shard);
            }

            if (config.pinger) {
              if (!hasMirrorNodeMemoryImprovements) {
                config.chartValues.set('pinger.enabled', false);
                config.chartValues.set('monitor.enabled', true);
                config.chartValues.set(
                  `monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.tps`,
                  constants.MIRROR_NODE_PINGER_TPS,
                );
              } else if (this.oneShotState.isActive() && config.parallelDeploy) {
                // One-shot parallel deploy: install the mirror node with the pinger fully
                // configured but disabled, then enable it from the orchestrator once
                // SoloEventType.NodesStarted fires (see enablePinger()). Bringing the pinger up
                // concurrently with the consensus node start races its SDK client against a
                // network that is not yet serving transactions and crashes it once. Standalone
                // mirror deploys and sequential one-shot deploys deploy the pinger normally.
                config.chartValues.set('pinger.enabled', false);
              }

              const operatorId: string =
                config.operatorId || this.accountManager.getOperatorAccountId(config.deployment).toString();
              const pingerRecipientAccountId: string = entityId(shard, realm, 98);
              config.chartValues.setLiteral(
                `monitor.config.${chartNamespace}.mirror.monitor.operator.accountId`,
                operatorId,
              );
              config.chartValues.setLiteral(
                `monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.properties.senderAccountId`,
                operatorId,
              );
              config.chartValues.setLiteral(
                `monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.properties.recipientAccountId`,
                pingerRecipientAccountId,
              );
              config.chartValues.setLiteral('pinger.env.HIERO_MIRROR_PINGER_OPERATOR_ID', operatorId);
              config.chartValues.setLiteral('pinger.env.HIERO_MIRROR_PINGER_TO_ACCOUNT_ID', pingerRecipientAccountId);

              if (config.operatorKey) {
                this.logger.info('Using provided operator key');
                config.chartValues.setLiteral(
                  `monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey`,
                  config.operatorKey,
                );
                config.chartValues.setLiteral('pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY', config.operatorKey);
              } else {
                try {
                  const namespace: NamespaceName = await resolveNamespaceFromDeployment(
                    this.localConfig,
                    this.configManager,
                    task,
                  );

                  const secrets: Secret[] = await this.k8Factory
                    .getK8(config.clusterContext)
                    .secrets()
                    .list(namespace, [`solo.hedera.com/account-id=${operatorId}`]);
                  if (secrets.length === 0) {
                    this.logger.info(`No k8s secret found for operator account id ${operatorId}, use default one`);
                    config.chartValues.setLiteral(
                      `monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey`,
                      constants.OPERATOR_KEY,
                    );
                    config.chartValues.setLiteral(
                      'pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY',
                      constants.OPERATOR_KEY,
                    );
                  } else {
                    this.logger.info('Using operator key from k8s secret');
                    const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
                    config.chartValues.setLiteral(
                      `monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey`,
                      operatorKeyFromK8,
                    );
                    config.chartValues.setLiteral('pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY', operatorKeyFromK8);
                  }
                } catch (error) {
                  throw new SoloErrors.component.mirrorNodeOperatorKeyRetrievalFailed(error);
                }
              }
            } else {
              context_.config.chartValues.set('monitor.enabled', false);
              context_.config.chartValues.set('pinger.enabled', false);
            }

            const isQuiet: boolean = config.quiet;

            // In case the useExternalDatabase is set, prompt for the rest of the required data
            if (config.useExternalDatabase && !isQuiet) {
              await this.configManager.executePrompt(task, [
                flags.externalDatabaseHost,
                flags.externalDatabaseOwnerUsername,
                flags.externalDatabaseOwnerPassword,
                flags.externalDatabaseReadonlyUsername,
                flags.externalDatabaseReadonlyPassword,
              ]);
            } else if (
              config.useExternalDatabase &&
              (!config.externalDatabaseHost ||
                !config.externalDatabaseOwnerUsername ||
                !config.externalDatabaseOwnerPassword ||
                !config.externalDatabaseReadonlyUsername ||
                !config.externalDatabaseReadonlyPassword)
            ) {
              this.validateExternalDatabaseFlags(config);
            }

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            this.addMirrorNodeMemoryOverrides(hasMirrorNodeMemoryImprovements, config);

            return this.oneShotState.isActive()
              ? ListrLock.newSkippedLockTask(task)
              : ListrLock.newAcquireLockTask(lease, task);
          },
        },
        this.addMirrorNodeComponents(),
        {
          title: 'load node client',
          task: async ({config}): Promise<void> => {
            await this.accountManager.loadNodeClient(
              config.namespace,
              this.remoteConfig.getClusterRefs(),
              config.deployment,
              this.configManager.getFlag<boolean>(flags.forcePortForward),
            );
          },
          skip: this.oneShotState.isActive(),
        },
        {
          title: 'Deploy charts',
          task: (_, parentTask): SoloListr<AnyListrContext> => {
            const subTasks: SoloListrTask<MirrorNodeDeployContext>[] = [
              this.enableSharedResourcesTask(),
              this.primePostgresSecretTask(), // creates mirror-passwords secret before init reads it
              this.deleteStaleRedisSecretTask(), // remove stale sentinel nodes left by a prior prime install
              this.initializeSharedPostgresDatabaseTask(), // must run before mirror chart so importer doesn't hold a session during DB creation
              this.enableMirrorNodeTask(MirrorNodeCommandType.ADD),
            ];

            return parentTask.newListr(subTasks, {
              concurrent: false, // shared resources must be configured and DB initialized before mirror chart is installed
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        this.checkPodsAreReadyNodeTask(),
        this.enablePortForwardingTask(),
        {
          title: 'Show user messages',
          skip: (): boolean => this.oneShotState.isActive(),
          task: (): void => {
            this.logger.showAllMessageGroups();
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'mirror node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('mirror node add has completed');
      } catch (error) {
        throw new SoloErrors.component.mirrorNodeDeployFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
        await this.accountManager.close();
      });
    }

    return true;
  }

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<MirrorNodeUpgradeContext> = this.taskList.newTaskList<MirrorNodeUpgradeContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
            this.configManager.update(argv);

            flags.disablePrompts(MirrorNodeCommand.UPGRADE_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...MirrorNodeCommand.UPGRADE_FLAGS_LIST.required,
              ...MirrorNodeCommand.UPGRADE_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: MirrorNodeUpgradeConfigClass = this.configManager.getConfig(
              MirrorNodeCommand.UPGRADE_CONFIGS_NAME,
              allFlags,
              [],
            ) as MirrorNodeUpgradeConfigClass;

            context_.config = config;

            config.mirrorNodeVersion = UpgradeVersionResolver.resolveFromFlags(
              this.configManager,
              [flags.mirrorNodeVersion],
              config.mirrorNodeVersion,
              this.remoteConfig.getComponentVersion(ComponentTypes.MirrorNode),
              versions.MIRROR_NODE_VERSION,
            );

            const hasMirrorNodeMemoryImprovements: boolean = new SemanticVersion<string>(
              config.mirrorNodeVersion,
            ).greaterThanOrEqual(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION);

            config.namespace = await this.getNamespace(task);
            config.clusterReference = this.getClusterReference();
            config.clusterContext = this.getClusterContext(config.clusterReference);

            const {id, releaseName, isChartInstalled, ingressReleaseName, isLegacyChartInstalled} =
              await this.inferDestroyData(config.namespace, config.clusterContext);

            config.id = id;
            config.releaseName = releaseName;
            config.isChartInstalled = isChartInstalled;
            config.ingressReleaseName = ingressReleaseName;
            config.isLegacyChartInstalled = isLegacyChartInstalled;
            config.installSharedResources = false;

            assertUpgradeVersionNotOlder(
              'Mirror node',
              config.mirrorNodeVersion,
              this.remoteConfig.getComponentVersion(ComponentTypes.MirrorNode),
              optionFromFlag(flags.mirrorNodeVersion),
            );

            context_.config.soloChartVersion = SemanticVersion.getValidSemanticVersion(
              context_.config.soloChartVersion,
              false,
              'Solo chart version',
              versions.MINIMUM_SOLO_CHART_VERSION,
            );

            const useMirrorNodeLegacyReleaseName: boolean = process.env.USE_MIRROR_NODE_LEGACY_RELEASE_NAME === 'true';
            if (useMirrorNodeLegacyReleaseName) {
              config.releaseName = constants.MIRROR_NODE_RELEASE_NAME;
              config.ingressReleaseName = constants.INGRESS_CONTROLLER_RELEASE_NAME;
            }

            // predefined values first
            config.chartValues = new HelmChartValues().file(constants.MIRROR_NODE_VALUES_FILE);

            // user defined values later to override predefined values
            config.chartValues.add(await this.prepareHelmChartValues(config));

            const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);

            // In one-shot mode the AccountManager is owned by the outer deploy flow;
            // calling loadNodeClient here would race with concurrent tasks (addNodeStakes,
            // Create accounts) that share the same singleton and corrupt its port-forward state.
            if (!this.oneShotState.isActive()) {
              await this.accountManager.loadNodeClient(
                config.namespace,
                this.remoteConfig.getClusterRefs(),
                deploymentName,
                this.configManager.getFlag<boolean>(flags.forcePortForward),
              );
            }

            const realm: Realm = this.localConfig.configuration.realmForDeployment(deploymentName);
            const shard: Shard = this.localConfig.configuration.shardForDeployment(deploymentName);
            const chartNamespace: string = MirrorNodeCommand.MIRROR_CHART_NAMESPACE;

            const modules: string[] = ['monitor', 'rest', 'grpc', 'importer', 'restjava', 'graphql', 'rosetta', 'web3'];
            for (const module of modules) {
              config.chartValues.set(`${module}.config.${chartNamespace}.mirror.common.realm`, +realm);
              config.chartValues.set(`${module}.config.${chartNamespace}.mirror.common.shard`, +shard);
            }

            if (config.pinger) {
              if (!hasMirrorNodeMemoryImprovements) {
                config.chartValues.set('pinger.enabled', false);
                config.chartValues.set('monitor.enabled', true);
                config.chartValues.set(
                  `monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.tps`,
                  5,
                );
              }

              // This is the mirror node version that switches the rest url configuration for the pinger from the rest to the restjava
              // service. The configuration needs to be updated when an upgrade crosses this version threshold.
              const updatePingerEnvironmentVariables: boolean = new SemanticVersion<string>(
                config.mirrorNodeVersion,
              ).greaterThanOrEqual(versions.MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_PINGER_ENV_VARS_UPDATE);
              if (updatePingerEnvironmentVariables) {
                config.chartValues.set(
                  'pinger.env.HIERO_MIRROR_PINGER_REST',
                  `http://${this.renderReleaseName(context_.config.id)}-restjava:80`,
                );
                config.chartValues.set('pinger.env.HIERO_MIRROR_PINGER_NETWORK', 'other');
              }

              const operatorId: string =
                config.operatorId || this.accountManager.getOperatorAccountId(deploymentName).toString();
              const pingerRecipientAccountId: string = entityId(shard, realm, 98);
              config.chartValues.setLiteral(
                `monitor.config.${chartNamespace}.mirror.monitor.operator.accountId`,
                operatorId,
              );
              config.chartValues.setLiteral(
                `monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.properties.senderAccountId`,
                operatorId,
              );
              config.chartValues.setLiteral(
                `monitor.config.${chartNamespace}.mirror.monitor.publish.scenarios.pinger.properties.recipientAccountId`,
                pingerRecipientAccountId,
              );
              config.chartValues.setLiteral('pinger.env.HIERO_MIRROR_PINGER_OPERATOR_ID', operatorId);
              config.chartValues.setLiteral('pinger.env.HIERO_MIRROR_PINGER_TO_ACCOUNT_ID', pingerRecipientAccountId);

              if (config.operatorKey) {
                this.logger.info('Using provided operator key');
                config.chartValues.setLiteral(
                  `monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey`,
                  config.operatorKey,
                );
                config.chartValues.setLiteral('pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY', config.operatorKey);
              } else {
                try {
                  const namespace: NamespaceName = await resolveNamespaceFromDeployment(
                    this.localConfig,
                    this.configManager,
                    task,
                  );

                  const secrets: Secret[] = await this.k8Factory
                    .getK8(config.clusterContext)
                    .secrets()
                    .list(namespace, [`solo.hedera.com/account-id=${operatorId}`]);
                  if (secrets.length === 0) {
                    this.logger.info(`No k8s secret found for operator account id ${operatorId}, use default one`);
                    config.chartValues.setLiteral(
                      `monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey`,
                      constants.OPERATOR_KEY,
                    );
                    config.chartValues.setLiteral(
                      'pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY',
                      constants.OPERATOR_KEY,
                    );
                  } else {
                    this.logger.info('Using operator key from k8s secret');
                    const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);
                    config.chartValues.setLiteral(
                      `monitor.config.${chartNamespace}.mirror.monitor.operator.privateKey`,
                      operatorKeyFromK8,
                    );
                    config.chartValues.setLiteral('pinger.env.HIERO_MIRROR_PINGER_OPERATOR_KEY', operatorKeyFromK8);
                  }
                } catch (error) {
                  throw new SoloErrors.component.mirrorNodeOperatorKeyRetrievalFailed(error);
                }
              }
            } else {
              context_.config.chartValues.set('monitor.enabled', false);
              context_.config.chartValues.set('pinger.enabled', false);
            }

            const isQuiet: boolean = config.quiet;

            // In case the useExternalDatabase is set, prompt for the rest of the required data
            if (config.useExternalDatabase && !isQuiet) {
              await this.configManager.executePrompt(task, [
                flags.externalDatabaseHost,
                flags.externalDatabaseOwnerUsername,
                flags.externalDatabaseOwnerPassword,
                flags.externalDatabaseReadonlyUsername,
                flags.externalDatabaseReadonlyPassword,
              ]);
            } else if (
              config.useExternalDatabase &&
              (!config.externalDatabaseHost ||
                !config.externalDatabaseOwnerUsername ||
                !config.externalDatabaseOwnerPassword ||
                !config.externalDatabaseReadonlyUsername ||
                !config.externalDatabaseReadonlyPassword)
            ) {
              this.validateExternalDatabaseFlags(config);
            }

            await this.throwIfNamespaceIsMissing(config.clusterContext, config.namespace);

            this.addMirrorNodeMemoryOverrides(hasMirrorNodeMemoryImprovements, config);

            return this.oneShotState.isActive()
              ? ListrLock.newSkippedLockTask(task)
              : ListrLock.newAcquireLockTask(lease, task);
          },
        },
        this.enableSharedResourcesTask(),
        this.deleteStaleRedisSecretTask(),
        this.primePostgresSecretTask(), // creates mirror-passwords secret if missing (e.g. re-install via upgrade)
        this.initializeSharedPostgresDatabaseTask(), // must run before mirror chart so importer doesn't hold a session during DB creation
        this.enableMirrorNodeTask(MirrorNodeCommandType.UPGRADE),
        this.checkPodsAreReadyNodeTask(),
        this.enablePortForwardingTask(),
        // TODO only show this if we are not running in quick-start mode
        // {
        //   title: 'Show user messages',
        //   task: (): void => {
        //     this.logger.showAllMessageGroups();
        //   },
        // },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'mirror node upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('mirror node upgrade has completed');
      } catch (error) {
        throw new SoloErrors.component.mirrorNodeUpgradeFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
        await this.accountManager.close();
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
        await this.accountManager.close();
      });
    }

    return true;
  }

  // Override values for mirror node memory optimizations
  private addMirrorNodeMemoryOverrides(
    hasMirrorNodeMemoryImprovements: boolean,
    config: MirrorNodeUpgradeConfigClass,
  ): void {
    const improvedMemoryModules: string[] = ['grpc', 'importer', 'rest', 'rest-java', 'web3'];
    const hasCustomComponentImage: boolean = !!config.componentImage?.trim();
    if (!hasMirrorNodeMemoryImprovements) {
      for (const module of improvedMemoryModules) {
        const configRoot: string = module.replaceAll('-', '');
        if (!hasCustomComponentImage) {
          config.chartValues.setLiteral(`${configRoot}.image.registry`, constants.MIRROR_NODE_OLD_IMAGE_REGISTRY);
          config.chartValues.setLiteral(
            `${configRoot}.image.repository`,
            `${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}${module}`,
          );
        }

        const memoryKey: keyof typeof constants =
          `MIRROR_NODE_OLD_MEMORY_${configRoot.toUpperCase()}` as keyof typeof constants;
        config.chartValues.setLiteral(`${configRoot}.resources.limits.memory`, constants[memoryKey] as string);
      }
    } else if (
      process.arch === 'arm64' &&
      new SemanticVersion<string>(config.mirrorNodeVersion).lessThan(
        versions.MINIMUM_MIRROR_NODE_VERSION_FOR_ARM64_WEB3_NATIVE_IMAGE,
      )
    ) {
      // web3 arm64 native images are only published starting with mirror node 0.155.0.
      if (!hasCustomComponentImage) {
        config.chartValues.setLiteral('web3.image.registry', constants.MIRROR_NODE_OLD_IMAGE_REGISTRY);
        config.chartValues.setLiteral('web3.image.repository', `${constants.MIRROR_NODE_OLD_IMAGE_REPO_ROOT}web3`);
      }
      config.chartValues.setLiteral('web3.resources.limits.memory', constants.MIRROR_NODE_OLD_MEMORY_WEB3);
    }
  }

  private validateExternalDatabaseFlags(config: MirrorNodeUpgradeConfigClass): void {
    const missingFlags: CommandFlag[] = [];
    if (!config.externalDatabaseHost) {
      missingFlags.push(flags.externalDatabaseHost);
    }
    if (!config.externalDatabaseOwnerUsername) {
      missingFlags.push(flags.externalDatabaseOwnerUsername);
    }
    if (!config.externalDatabaseOwnerPassword) {
      missingFlags.push(flags.externalDatabaseOwnerPassword);
    }

    if (!config.externalDatabaseReadonlyUsername) {
      missingFlags.push(flags.externalDatabaseReadonlyUsername);
    }
    if (!config.externalDatabaseReadonlyPassword) {
      missingFlags.push(flags.externalDatabaseReadonlyPassword);
    }

    if (missingFlags.length > 0) {
      const errorMessage: string =
        'There are missing values that need to be provided when' +
        `${chalk.cyan(`--${flags.useExternalDatabase.name}`)} is provided: `;

      throw new SoloErrors.validation.missingArgument(
        `${errorMessage} ${missingFlags.map((flag: CommandFlag): string => `--${flag.name}`).join(', ')}`,
      );
    }
  }

  /**
   * Encodes a shard.realm.num entity ID into the integer form used by the mirror node database.
   * Matches the encoding in EntityId.java: |10-bit shard|16-bit realm|38-bit num|
   */
  private static encodeEntityId(shard: number, realm: number, entityNumber: number): string {
    if (shard === 0 && realm === 0) {
      return String(entityNumber);
    }
    const NUM_BITS: bigint = 38n;
    const REALM_BITS: bigint = 16n;
    const encoded: bigint =
      (BigInt(entityNumber) & ((1n << NUM_BITS) - 1n)) |
      ((BigInt(realm) & ((1n << REALM_BITS) - 1n)) << NUM_BITS) |
      (BigInt(shard) << (REALM_BITS + NUM_BITS));
    return encoded.toString();
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<MirrorNodeDestroyContext> = this.taskList.newTaskList<MirrorNodeDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            if (!this.oneShotState.isActive()) {
              lease = await this.leaseManager.create();
            }
            if (!argv.force) {
              const confirmResult: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                default: false,
                message: 'Are you sure you would like to destroy the mirror node components?',
              });

              if (!confirmResult) {
                throw new UserBreak('Aborted application by user prompt');
              }
            }

            this.configManager.update(argv);

            const namespace: NamespaceName = await this.getNamespace(task);
            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const clusterContext: Context = this.getClusterContext(clusterReference);

            await this.throwIfNamespaceIsMissing(clusterContext, namespace);

            const {id, releaseName, isChartInstalled, ingressReleaseName, isLegacyChartInstalled} =
              await this.inferDestroyData(namespace, clusterContext);

            context_.config = {
              clusterContext,
              namespace,
              clusterReference,
              id,
              isChartInstalled,
              releaseName,
              ingressReleaseName,
              isLegacyChartInstalled,
              isIngressControllerChartInstalled: await this.chartManager.isChartInstalled(
                namespace,
                ingressReleaseName,
                clusterContext,
              ),
            };

            if (!this.oneShotState.isActive()) {
              return ListrLock.newAcquireLockTask(lease, task);
            }
            return ListrLock.newSkippedLockTask(task);
          },
        },
        {
          title: 'Destroy mirror-node',
          task: async (context_): Promise<void> => {
            await this.chartManager.uninstall(
              context_.config.namespace,
              context_.config.releaseName,
              context_.config.clusterContext,
            );
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        {
          title: 'Delete PVCs',
          task: async (context_): Promise<void> => {
            // filtering postgres and redis PVCs using instance labels
            // since they have different name or component labels
            const pvcs: string[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .pvcs()
              .list(context_.config.namespace, [`app.kubernetes.io/instance=${context_.config.releaseName}`]);

            if (pvcs) {
              for (const pvc of pvcs) {
                await this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .pvcs()
                  .delete(PvcReference.of(context_.config.namespace, PvcName.of(pvc)));
              }
            }
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        {
          title: 'Destroy shared resources',
          task: async (context_): Promise<void> => {
            await this.sharedResourceManager.uninstallChart(context_.config.namespace, context_.config.clusterContext);

            // Delete PVCs left behind by the shared resources chart (Postgres data volume)
            const pvcs: string[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .pvcs()
              .list(context_.config.namespace, ['app.kubernetes.io/instance=solo-shared-resources']);

            for (const pvc of pvcs) {
              await this.k8Factory
                .getK8(context_.config.clusterContext)
                .pvcs()
                .delete(PvcReference.of(context_.config.namespace, PvcName.of(pvc)));
            }
          },
        },
        this.disableSharedResourceComponents(),
        {
          title: 'Uninstall mirror ingress controller',
          skip: (context_): boolean => !context_.config.isIngressControllerChartInstalled,
          task: async (context_): Promise<void> => {
            await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .delete(constants.MIRROR_INGRESS_CLASS_NAME);

            if (
              await this.k8Factory
                .getK8(context_.config.clusterContext)
                .configMaps()
                .exists(context_.config.namespace, 'ingress-controller-leader-' + constants.MIRROR_INGRESS_CLASS_NAME)
            ) {
              await this.k8Factory
                .getK8(context_.config.clusterContext)
                .configMaps()
                .delete(context_.config.namespace, 'ingress-controller-leader-' + constants.MIRROR_INGRESS_CLASS_NAME);
            }

            await this.chartManager.uninstall(
              context_.config.namespace,
              context_.config.ingressReleaseName,
              context_.config.clusterContext,
            );
            // delete ingress class if found one
            const existingIngressClasses: IngressClass[] = await this.k8Factory
              .getK8(context_.config.clusterContext)
              .ingressClasses()
              .list();
            for (const ingressClass of existingIngressClasses) {
              if (ingressClass.name === constants.MIRROR_INGRESS_CLASS_NAME) {
                await this.k8Factory
                  .getK8(context_.config.clusterContext)
                  .ingressClasses()
                  .delete(constants.MIRROR_INGRESS_CLASS_NAME);
              }
            }
          },
        },
        this.disableMirrorNodeComponents(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'mirror node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.component.mirrorNodeDestroyFailed(error);
      } finally {
        await this.accountManager?.close().catch();
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {
        await this.accountManager?.close().catch();
        if (!this.oneShotState.isActive()) {
          await lease?.release();
        }
      });
    }

    return true;
  }

  /** Removes the mirror node components from remote config. */
  public disableMirrorNodeComponents(): SoloListrTask<MirrorNodeDestroyContext> {
    return {
      title: 'Remove mirror node from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(context_.config.id, ComponentTypes.MirrorNode);

        await this.remoteConfig.persist();
      },
    };
  }

  /** Removes the Postgres and Redis components from remote config when shared resources are destroyed. */
  public disableSharedResourceComponents(): SoloListrTask<MirrorNodeDestroyContext> {
    return {
      title: 'Remove shared resource components from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (): Promise<void> => {
        const postgresComponents: PostgresStateSchema[] =
          this.remoteConfig.configuration.components.getComponentByType<PostgresStateSchema>(ComponentTypes.Postgres);
        for (const component of postgresComponents) {
          this.remoteConfig.configuration.components.removeComponent(component.metadata.id, ComponentTypes.Postgres);
        }

        const redisComponents: RedisStateSchema[] =
          this.remoteConfig.configuration.components.getComponentByType<RedisStateSchema>(ComponentTypes.Redis);
        for (const component of redisComponents) {
          this.remoteConfig.configuration.components.removeComponent(component.metadata.id, ComponentTypes.Redis);
        }

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the mirror node components to remote config. */
  public addMirrorNodeComponents(): SoloListrTask<MirrorNodeDeployContext> {
    return {
      title: 'Add mirror node to remote config',
      skip: (context_): boolean => {
        return !this.remoteConfig.isLoaded() || context_.config.isChartInstalled || this.oneShotState.isActive();
      },
      task: async (context_): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(
          context_.config.newMirrorNodeComponent,
          ComponentTypes.MirrorNode,
        );

        // update mirror node version in remote config
        this.remoteConfig.updateComponentVersion(
          ComponentTypes.MirrorNode,
          new SemanticVersion<string>(context_.config.mirrorNodeVersion),
        );

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  private async checkIfLegacyChartIsInstalled(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
  ): Promise<boolean> {
    return id === 1
      ? await this.chartManager.isChartInstalled(namespace, constants.MIRROR_NODE_RELEASE_NAME, context)
      : false;
  }

  private inferMirrorNodeId(): ComponentId {
    const id: ComponentId = this.configManager.getFlag(flags.id);

    if (typeof id === 'number') {
      return id;
    }

    if (this.remoteConfig.configuration.components.state.mirrorNodes.length === 0) {
      throw new SoloErrors.system.mirrorNodeNotInRemoteConfig();
    }

    return this.remoteConfig.configuration.components.state.mirrorNodes[0].metadata.id;
  }

  private async inferDestroyData(namespace: NamespaceName, context: Context): Promise<InferredData> {
    const id: ComponentId = this.inferMirrorNodeId();

    const isLegacyChartInstalled: boolean = await this.checkIfLegacyChartIsInstalled(id, namespace, context);
    const ingressReleaseName: string = await this.inferInstalledIngressReleaseName(namespace, context, id);

    if (isLegacyChartInstalled) {
      return {
        id,
        releaseName: constants.MIRROR_NODE_RELEASE_NAME,
        isChartInstalled: true,
        ingressReleaseName,
        isLegacyChartInstalled,
      };
    }

    const releaseName: string = this.renderReleaseName(id);
    return {
      id,
      releaseName,
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      ingressReleaseName,
      isLegacyChartInstalled,
    };
  }

  private async inferInstalledIngressReleaseName(
    namespace: NamespaceName,
    context: Context,
    id: ComponentId,
  ): Promise<string> {
    const candidates: string[] = [
      this.renderIngressReleaseName(id),
      `${constants.INGRESS_CONTROLLER_RELEASE_NAME}-${namespace.name}`,
      constants.INGRESS_CONTROLLER_RELEASE_NAME,
    ];

    for (const releaseName of candidates) {
      if (await this.chartManager.isChartInstalled(namespace, releaseName, context)) {
        return releaseName;
      }
    }

    // Keep existing behavior as fallback when no ingress release is currently installed.
    return this.renderIngressReleaseName(id);
  }

  private async adoptMirrorIngressControllerRbacOwnership(config: MirrorNodeDeployConfigClass): Promise<void> {
    const rbac: Rbacs = this.k8Factory.getK8(config.clusterContext).rbac();
    const rbacNames: Set<string> = new Set([
      constants.MIRROR_INGRESS_CONTROLLER,
      `${constants.MIRROR_INGRESS_CONTROLLER}-${config.namespace.name}`,
    ]);

    for (const rbacName of rbacNames) {
      await rbac.setHelmOwnership(rbacName, config.ingressReleaseName, config.namespace.name);
    }
  }
}
