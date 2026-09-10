// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type AccountManager} from '../../core/account-manager.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type OneShotState} from '../../core/one-shot-state.js';
import {type KeyManager} from '../../core/key-manager.js';
import {type ProfileManager} from '../../core/profile-manager.js';
import {type PlatformInstaller} from '../../core/platform-installer.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ChartManager} from '../../core/chart-manager.js';
import {HelmChartValues} from '../../integration/helm/model/values.js';
import {type CertificateManager} from '../../core/certificate-manager.js';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {ReleaseItem} from '../../integration/helm/model/release/release-item.js';
import {Zippy} from '../../core/zippy.js';
import * as constants from '../../core/constants.js';
import {
  CHECK_WRAPS_DIRECTORY_BACKOFF_MS,
  CHECK_WRAPS_DIRECTORY_MAX_ATTEMPTS,
  DEFAULT_NETWORK_NODE_NAME,
  HEDERA_HAPI_PATH,
  HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
} from '../../core/constants.js';
import {Templates} from '../../core/templates.js';
import {
  AccountId,
  type AccountInfo,
  AccountInfoQuery,
  AccountUpdateTransaction,
  type Client,
  FileAppendTransaction,
  FileId,
  FileUpdateTransaction,
  FreezeTransaction,
  FreezeType,
  Long,
  NodeCreateTransaction,
  NodeDeleteTransaction,
  NodeUpdateTransaction,
  PrivateKey,
  ServiceEndpoint,
  Status,
  Timestamp,
  TransactionReceipt,
  TransactionResponse,
} from '@hiero-ledger/sdk';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import find from 'find-process';
import type FindConfig from 'find-process';
import type ProcessInfo from 'find-process';
import {
  createAndCopyBlockNodeJsonFileForConsensusNode,
  entityId,
  extractContextFromConsensusNodes,
  Helpers,
  parseNodeAliases,
  prepareEndpoints,
  renameAndCopyFile,
  parseIpAddressToUint8Array,
  resolveGossipFqdnRestricted,
  showVersionBanner,
  sleep,
  splitFlagInput,
} from '../../core/helpers.js';
import chalk from 'chalk';
import {Flags as flags} from '../flags.js';
import {
  HEDERA_PLATFORM_VERSION,
  MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS,
  MINIMUM_SOLO_CHART_VERSION,
} from '../../../version.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {
  type AnyListrContext,
  type AnyObject,
  type ArgvStruct,
  type ConfigBuilder,
  type IP,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
  type SkipCheck,
} from '../../types/aliases.js';
import {PodName} from '../../integration/kube/resources/pod/pod-name.js';
import {NodeStatusCodes, NodeStatusEnums, NodeSubcommandType} from '../../core/enumerations.js';
import {type Lock} from '../../core/lock/lock.js';
import {type LeaseWrapper} from './lease-wrapper.js';
import {ListrLock} from '../../core/lock/listr-lock.js';
import {Duration} from '../../core/time/duration.js';
import {type NodeAddConfigClass} from './config-interfaces/node-add-config-class.js';
import {GenesisNetworkDataConstructor} from '../../core/genesis-network-models/genesis-network-data-constructor.js';
import {NodeOverridesModel} from '../../core/node-overrides-model.js';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {PodReference} from '../../integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../integration/kube/resources/container/container-reference.js';
import {NetworkNodes} from '../../core/network-nodes.js';
import {container, inject, injectable} from 'tsyringe-neo';
import {
  type AccountIdWithKeyPairObject,
  type ClusterReferenceName,
  type ClusterReferences,
  type ComponentData,
  type ComponentDisplayName,
  type ComponentId,
  type Context,
  type DeploymentName,
  type EndpointPortMapping,
  type NodeAliasToAddressMapping,
  type Optional,
  type PriorityMapping,
  type Realm,
  type Shard,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../../types/index.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ConsensusNode} from '../../core/model/consensus-node.js';
import {type K8} from '../../integration/kube/k8.js';
import {Base64} from 'js-base64';
import {SecretType} from '../../integration/kube/resources/secret/secret-type.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {SubprocessEnvironment} from '../../core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../core/subprocess-command-profile.js';
import {helmValuesHelper} from '../../core/helm-values-helper.js';
import {type GitClient} from '../../integration/git/git-client.js';
import {type NodeDestroyConfigClass} from './config-interfaces/node-destroy-config-class.js';
import {type NodeRefreshConfigClass} from './config-interfaces/node-refresh-config-class.js';
import {type NodeUpdateConfigClass} from './config-interfaces/node-update-config-class.js';
import {type NodeAddContext} from './config-interfaces/node-add-context.js';
import {type NodeDestroyContext} from './config-interfaces/node-destroy-context.js';
import {type NodeUpdateContext} from './config-interfaces/node-update-context.js';
import {type NodeStatesContext} from './config-interfaces/node-states-context.js';
import {type NodeUpgradeContext} from './config-interfaces/node-upgrade-context.js';
import {type NodeRefreshContext} from './config-interfaces/node-refresh-context.js';
import {type NodeStopContext} from './config-interfaces/node-stop-context.js';
import {type NodeFreezeContext} from './config-interfaces/node-freeze-context.js';
import {type NodeStartContext} from './config-interfaces/node-start-context.js';
import {type NodeRestartContext} from './config-interfaces/node-restart-context.js';
import {type NodeCommonConfigClass} from './config-interfaces/node-common-config-class.js';
import {type NodeSetupContext} from './config-interfaces/node-setup-context.js';
import {type NodeKeysContext} from './config-interfaces/node-keys-context.js';
import {type NodeKeysConfigClass} from './config-interfaces/node-keys-config-class.js';
import {type NodeStartConfigClass} from './config-interfaces/node-start-config-class.js';
import {type CheckedNodesConfigClass} from './config-interfaces/checked-nodes-config-class.js';
import {type CheckedNodesContext} from './config-interfaces/checked-nodes-context.js';
import {type NetworkNodeServices} from '../../core/network-node-services.js';
import {ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';
import {DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type ComponentFactoryApi} from '../../core/config/remote/api/component-factory-api.js';
import {type LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {ClusterSchema} from '../../data/schema/model/common/cluster-schema.js';
import {LockManager} from '../../core/lock/lock-manager.js';
import {type NodeServiceMapping} from '../../types/mappings/node-service-mapping.js';
import {Pod} from '../../integration/kube/resources/pod/pod.js';
import {type Pods} from '../../integration/kube/resources/pod/pods.js';
import {type Container} from '../../integration/kube/resources/container/container.js';
import {SemanticVersion} from '../../business/utils/semantic-version.js';
import {DeploymentStateSchema} from '../../data/schema/model/remote/deployment-state-schema.js';
import {type BaseStateSchema} from '../../data/schema/model/remote/state/base-state-schema.js';
import {type BlockNodeStateSchema} from '../../data/schema/model/remote/state/block-node-state-schema.js';
import {ComponentStateMetadataSchema} from '../../data/schema/model/remote/state/component-state-metadata-schema.js';
import net from 'node:net';
import {type NodeConnectionsContext} from './config-interfaces/node-connections-context.js';
import {TDirectoryData} from '../../integration/kube/t-directory-data.js';
import {Service} from '../../integration/kube/resources/service/service.js';
import {Address} from '../../business/address/address.js';
import {Contexts} from '../../integration/kube/resources/context/contexts.js';
import {K8Helper} from '../../business/utils/k8-helper.js';
import {Secret} from '../../integration/kube/resources/secret/secret.js';
import {NodeUpgradeConfigClass} from './config-interfaces/node-upgrade-config-class.js';
import {NodeCollectJfrLogsContext} from './config-interfaces/node-collect-jfr-logs-context.js';
import {NodeCollectJfrLogsConfigClass} from './config-interfaces/node-collect-jfr-logs-config-class.js';
import {PackageDownloader} from '../../core/package-downloader.js';
import {DefaultHelmClient} from '../../integration/helm/impl/default-helm-client.js';
import {CommandFlag} from '../../types/flag-types.js';
import {ConsensusNodePathTemplates} from '../../core/consensus-node-path-templates.js';
import {type ConfigProvider} from '../../data/configuration/api/config-provider.js';
import {SoloConfig} from '../../business/runtime-state/config/solo/solo-config.js';
import {type Wraps} from '../../business/runtime-state/config/solo/wraps.js';
import {DiagnosticsAnalyzer} from '../util/diagnostics-analyzer.js';
import {NodesStartedEvent} from '../../core/events/event-types/nodes-started-event.js';
import {type SoloEventBus} from '../../core/events/solo-event-bus.js';
import {Listr} from 'listr2';
import {HaProxyStateSchema} from '../../data/schema/model/remote/state/ha-proxy-state-schema.js';
import {ContainerName} from '../../integration/kube/resources/container/container-name.js';

const localBuildPathFilter: (path: string | string[]) => boolean = (path: string | string[]): boolean => {
  return !(path.includes('data/keys') || path.includes('data/config') || path.includes('data/upgrade'));
};

const NETWORK_PROXY_INITIAL_READY_ATTEMPTS: number = 15;

const {gray, cyan, red, green, yellow} = chalk;

@injectable()
export class NodeCommandTasks {
  private readonly soloConfig: SoloConfig;
  private static readonly GENERATED_GOSSIP_LOAD_BALANCER_MAX_ATTEMPTS: number = 60;
  private static readonly GENERATED_GOSSIP_LOAD_BALANCER_RETRY_DELAY: Duration = Duration.ofSeconds(1);
  private static readonly GRPC_TLS_PORT: number = 50_212;
  private static readonly BLOCK_NODE_RSA_BOOTSTRAP_FILE: string = 'rsa-bootstrap-roster.json';
  private static readonly BLOCK_NODE_APPLICATION_STATE_DIRECTORY: string = '/opt/hiero/block-node/application-state';

  /**
   * Component types whose pod logs and describes {@link downloadHieroComponentLogs} collects, with
   * the label selector that finds each one.
   *
   * This list is maintained by hand and had drifted from the components Solo actually deploys —
   * HAProxy and Envoy were missing, so a crash-looping proxy was invisible to
   * {@link DiagnosticsAnalyzer} and surfaced only as a downstream client error (a failed SDK ping,
   * a gRPC timeout) attributed to the consensus node behind it. Add an entry here whenever a new
   * component type is deployed.
   *
   * Exposed for {@link componentLabelConfigs} so tests can assert coverage of that list.
   */
  private static readonly COMPONENT_LABEL_CONFIGS: ReadonlyArray<{name: string; labels: string[]}> = [
    {name: 'consensus node', labels: ['solo.hedera.com/type=network-node']},
    {name: 'haproxy', labels: ['solo.hedera.com/type=haproxy']},
    {name: 'envoy proxy', labels: ['solo.hedera.com/type=envoy-proxy']},
    {name: 'mirror importer', labels: [constants.SOLO_MIRROR_IMPORTER_NAME_LABEL]},
    {name: 'mirror pinger', labels: [constants.SOLO_MIRROR_PINGER_NAME_LABEL]},
    {name: 'mirror grpc', labels: [constants.SOLO_MIRROR_GRPC_NAME_LABEL]},
    {name: 'mirror monitor', labels: [constants.SOLO_MIRROR_MONITOR_NAME_LABEL]},
    {name: 'mirror rest', labels: [constants.SOLO_MIRROR_REST_NAME_LABEL]},
    {name: 'mirror web3', labels: [constants.SOLO_MIRROR_WEB3_NAME_LABEL]},
    {name: 'mirror postgres', labels: [constants.SOLO_MIRROR_POSTGRES_NAME_LABEL]},
    {name: 'mirror redis', labels: [constants.SOLO_MIRROR_REDIS_NAME_LABEL]},
    {name: 'mirror rest-java', labels: [constants.SOLO_MIRROR_RESTJAVA_NAME_LABEL]},
    {name: 'relay node', labels: [constants.SOLO_RELAY_NAME_LABEL]},
    {name: 'explorer', labels: [constants.SOLO_EXPLORER_LABEL]},
    {name: 'block node', labels: [constants.SOLO_BLOCK_NODE_NAME_LABEL]},
    {name: 'ingress controller', labels: [constants.SOLO_INGRESS_CONTROLLER_NAME_LABEL]},
    {name: 'network load generator', labels: constants.NETWORK_LOAD_GENERATOR_POD_LABELS},
  ];

  /** Read-only view of {@link COMPONENT_LABEL_CONFIGS}, for tests that guard against drift. */
  public static get componentLabelConfigs(): ReadonlyArray<{name: string; labels: string[]}> {
    return NodeCommandTasks.COMPONENT_LABEL_CONFIGS;
  }

  private static getDefaultBlockNodeIdsForCluster(
    blockNodes: BlockNodeStateSchema[],
    clusterReference: ClusterReferenceName,
  ): ComponentId[] {
    const clusterBlockNodeIds: ComponentId[] = blockNodes
      .filter((node: BlockNodeStateSchema): boolean => node.metadata.cluster === clusterReference)
      .map((node: BlockNodeStateSchema): ComponentId => node.metadata.id);

    return clusterBlockNodeIds.length > 0
      ? clusterBlockNodeIds
      : blockNodes.map((node: BlockNodeStateSchema): ComponentId => node.metadata.id);
  }

  private static serviceEndpointFromAddress(address: Address): ServiceEndpoint {
    if (address.domainName) {
      return new ServiceEndpoint({
        port: address.port,
        domainName: address.domainName,
      });
    }

    return new ServiceEndpoint({
      port: address.port,
      ipAddressV4: parseIpAddressToUint8Array(address.ipAddressV4),
    });
  }

  private static shouldAvoidGossipFqdn(consensusNodes: ConsensusNode[], gossipFqdnRestricted: boolean): boolean {
    return gossipFqdnRestricted || Helpers.hasMultipleKubernetesContexts(consensusNodes);
  }

  private static buildNetworkNodeServiceManifest(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    nodeId: NodeId,
    accountId: string,
  ): AnyObject {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        annotations: {
          'meta.helm.sh/release-name': constants.SOLO_DEPLOYMENT_CHART,
          'meta.helm.sh/release-namespace': namespace.name,
        },
        labels: {
          'app.kubernetes.io/managed-by': 'Helm',
          'solo.hedera.com/account-id': accountId,
          'solo.hedera.com/node-id': nodeId.toString(),
          'solo.hedera.com/node-name': nodeAlias,
          'solo.hedera.com/prometheus-endpoint': 'active',
          'solo.hedera.com/type': 'network-node-svc',
        },
        name: Templates.renderNetworkSvcName(nodeAlias),
        namespace: namespace.name,
      },
      spec: {
        externalTrafficPolicy: 'Local',
        ports: [
          {
            name: 'gossip',
            port: +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
            protocol: 'TCP',
            targetPort: +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
          },
          {
            name: 'grpc-non-tls',
            port: +constants.GRPC_PORT,
            protocol: 'TCP',
            targetPort: +constants.GRPC_PORT,
          },
          {
            name: 'grpc-tls',
            port: NodeCommandTasks.GRPC_TLS_PORT,
            protocol: 'TCP',
            targetPort: NodeCommandTasks.GRPC_TLS_PORT,
          },
          {
            name: 'prometheus',
            port: 9090,
            protocol: 'TCP',
            targetPort: 9999,
          },
        ],
        publishNotReadyAddresses: true,
        selector: {
          app: `network-${nodeAlias}`,
        },
        type: 'LoadBalancer',
      },
    };
  }

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.PlatformInstaller) private readonly platformInstaller: PlatformInstaller,
    @inject(InjectTokens.KeyManager) private readonly keyManager: KeyManager,
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.CertificateManager) private readonly certificateManager: CertificateManager,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi,
    @inject(InjectTokens.OneShotState) private readonly oneShotState: OneShotState,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
    @inject(InjectTokens.PackageDownloader) private readonly downloader: PackageDownloader,
    @inject(InjectTokens.GitClient) private readonly gitClient: GitClient,
    @inject(InjectTokens.ConfigProvider) configProvider: ConfigProvider,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.platformInstaller = patchInject(platformInstaller, InjectTokens.PlatformInstaller, this.constructor.name);
    this.keyManager = patchInject(keyManager, InjectTokens.KeyManager, this.constructor.name);
    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.certificateManager = patchInject(certificateManager, InjectTokens.CertificateManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.oneShotState = patchInject(oneShotState, InjectTokens.OneShotState, this.constructor.name);
    this.zippy = patchInject(zippy, InjectTokens.Zippy, this.constructor.name);
    this.downloader = patchInject(downloader, InjectTokens.PackageDownloader, this.constructor.name);
    this.gitClient = patchInject(gitClient, InjectTokens.GitClient, this.constructor.name);
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
    configProvider = patchInject(configProvider, InjectTokens.ConfigProvider, this.constructor.name);
    this.soloConfig = SoloConfig.getConfig(configProvider);
  }

  private getFileUpgradeId(deploymentName: DeploymentName): FileId {
    const realm: Realm = this.localConfig.configuration.realmForDeployment(deploymentName);
    const shard: Shard = this.localConfig.configuration.shardForDeployment(deploymentName);
    return FileId.fromString(entityId(shard, realm, constants.UPGRADE_FILE_ID_NUM));
  }

  private async _prepareUpgradeZip(stagingDirectory: string, upgradeVersion?: string): Promise<string> {
    // we build a mock upgrade.zip file as we really don't need to upgrade the network
    // also the platform zip file is ~80Mb in size requiring a lot of transactions since the max
    // transaction size is 6Kb and in practice we need to send the file as 4Kb chunks.
    // Note however that in DAB phase-2, we won't need to trigger this fake upgrade process
    const zipper: Zippy = new Zippy(this.logger);
    const upgradeConfigDirectory: string = PathEx.join(stagingDirectory, 'mock-upgrade', 'data', 'config');
    if (!fs.existsSync(upgradeConfigDirectory)) {
      fs.mkdirSync(upgradeConfigDirectory, {recursive: true});
    }

    // bump field hedera.config.version or use the version passed in
    const fileBytes: Buffer = fs.readFileSync(
      PathEx.joinWithRealPath(stagingDirectory, 'templates', constants.APPLICATION_PROPERTIES),
    );
    const lines: string[] = fileBytes.toString().split('\n');
    const newLines: string[] = [];
    for (let line of lines) {
      line = line.trim();
      const parts: string[] = line.split('=');
      if (parts.length === 2) {
        if (parts[0] === 'hedera.config.version') {
          const version: string = upgradeVersion ?? String(Number.parseInt(parts[1]) + 1);
          line = `hedera.config.version=${version}`;
        }
        newLines.push(line);
      }
    }
    fs.writeFileSync(PathEx.join(upgradeConfigDirectory, constants.APPLICATION_PROPERTIES), newLines.join('\n'));

    return await zipper.zip(
      PathEx.join(stagingDirectory, 'mock-upgrade'),
      PathEx.join(stagingDirectory, 'mock-upgrade.zip'),
    );
  }

  private async _uploadUpgradeZip(
    upgradeZipFile: string,
    nodeClient: Client,
    deploymentName: DeploymentName,
  ): Promise<string> {
    // get byte value of the zip file
    const zipBytes: Buffer = fs.readFileSync(upgradeZipFile);
    const zipHash: string = crypto.createHash('sha384').update(zipBytes).digest('hex');
    this.logger.debug(
      `loaded upgrade zip file [ zipHash = ${zipHash} zipBytes.length = ${zipBytes.length}, zipPath = ${upgradeZipFile}]`,
    );

    // create a file upload transaction to upload file to the network
    try {
      let start: number = 0;

      while (start < zipBytes.length) {
        const zipBytesChunk: Uint8Array<ArrayBuffer> = new Uint8Array(
          zipBytes.subarray(start, start + constants.UPGRADE_FILE_CHUNK_SIZE),
        );
        let fileTransaction: FileUpdateTransaction | FileAppendTransaction | undefined = undefined;

        fileTransaction =
          start === 0
            ? new FileUpdateTransaction().setFileId(this.getFileUpgradeId(deploymentName)).setContents(zipBytesChunk)
            : new FileAppendTransaction().setFileId(this.getFileUpgradeId(deploymentName)).setContents(zipBytesChunk);
        const resp: TransactionResponse = await fileTransaction.execute(nodeClient);
        const receipt: TransactionReceipt = await resp.getReceipt(nodeClient);
        this.logger.debug(
          `updated file ${this.getFileUpgradeId(deploymentName)} [chunkSize= ${zipBytesChunk.length}, txReceipt = ${receipt.toString()}]`,
        );

        start += constants.UPGRADE_FILE_CHUNK_SIZE;
        this.logger.debug(`uploaded ${start} bytes of ${zipBytes.length} bytes`);
      }

      return zipHash;
    } catch (error) {
      throw new SoloErrors.component.nodeBuildUploadFailed(error);
    }
  }

  private async copyLocalBuildPathToNode(
    k8: K8,
    podReference: PodReference,
    configManager: ConfigManager,
    localDataLibraryBuildPath: string,
  ): Promise<void> {
    const container: Container = k8
      .containers()
      .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER));

    await container.execContainer(['bash', '-c', this.buildStopNetworkNodeCommand()]);

    // Remove existing jars before copying to prevent mixed-version classpath (issue #3848)
    await container.execContainer([
      'bash',
      '-c',
      `rm -rf ${constants.HEDERA_HAPI_PATH}/${constants.HEDERA_DATA_LIB_DIR}/*.jar ${constants.HEDERA_HAPI_PATH}/${constants.HEDERA_DATA_APPS_DIR}/*.jar`,
    ]);

    await container.copyTo(localDataLibraryBuildPath, `${constants.HEDERA_HAPI_PATH}`, localBuildPathFilter);
    await container.execContainer(['bash', '-c', this.buildNormalizeHederaJarPermissionsCommand()]);

    const upgradeDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`;
    if (await container.hasDir(upgradeDirectory)) {
      await container.execContainer([
        'bash',
        '-c',
        `rm -rf ${upgradeDirectory}/${constants.HEDERA_DATA_LIB_DIR}/*.jar ${upgradeDirectory}/${constants.HEDERA_DATA_APPS_DIR}/*.jar`,
      ]);
      await container.copyTo(localDataLibraryBuildPath, upgradeDirectory, localBuildPathFilter);
      await container.execContainer(['bash', '-c', this.buildNormalizeHederaJarPermissionsCommand(upgradeDirectory)]);
    }

    await container.execContainer(['sync', constants.HEDERA_HAPI_PATH]);

    if (configManager.getFlag<string>(flags.appConfig)) {
      const testJsonFiles: string[] = configManager.getFlag<string>(flags.appConfig)!.split(',');
      for (const jsonFile of testJsonFiles) {
        if (fs.existsSync(jsonFile)) {
          await container.copyTo(jsonFile, `${constants.HEDERA_HAPI_PATH}`);
        }
      }
    }
  }

  private async validateNodePvcsForLocalBuildPath(namespace: NamespaceName, contexts: string[]): Promise<void> {
    await Promise.all(
      contexts.map(async (context): Promise<void> => {
        const pvcs: string[] = await this.k8Factory
          .getK8(context)
          .pvcs()
          .list(namespace, ['solo.hedera.com/type=node-pvc']);

        if (pvcs.length === 0) {
          this.logger.showUser(
            chalk.yellow(
              'Warning: Custom JARs provided via --local-build-path require node PVCs to persist across pod restarts. ' +
                'To prevent losing data after node restarts redeploy the consensus network with ' +
                '`consensus network deploy --pvcs true` and run `consensus node setup` again.',
            ),
          );
        }
      }),
    );
  }

  private _uploadPlatformSoftware(
    nodeAliases: NodeAliases,
    podReferences: Record<NodeAlias, PodReference>,
    task: SoloListrTaskWrapper<AnyListrContext>,
    localBuildPath: string,
    consensusNodes: ConsensusNode[],
    releaseTag: string,
  ): SoloListr<AnyListrContext> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];

    this.logger.debug('no need to fetch, use local build jar files');

    const buildPathMap: Map<NodeAlias, string> = new Map<NodeAlias, string>();
    let defaultDataLibraryBuildPath: string;
    const parameterPairs: string[] = localBuildPath.split(',');
    for (const parameterPair of parameterPairs) {
      if (parameterPair.includes('=')) {
        const [nodeAlias, localDataLibraryBuildPath]: string[] = parameterPair.split('=');
        buildPathMap.set(nodeAlias as NodeAlias, localDataLibraryBuildPath);
      } else {
        defaultDataLibraryBuildPath = parameterPair;
      }
    }

    let localDataLibraryBuildPath: string;

    for (const nodeAlias of nodeAliases) {
      const podReference: PodReference = podReferences[nodeAlias];
      const context: string = extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      localDataLibraryBuildPath = buildPathMap.has(nodeAlias)
        ? buildPathMap.get(nodeAlias)
        : defaultDataLibraryBuildPath;

      if (!fs.existsSync(localDataLibraryBuildPath)) {
        throw new SoloErrors.validation.localBuildPathNotFound(localDataLibraryBuildPath);
      }

      // The local build path points to the `data` directory itself (containing apps/ and lib/).
      // Validate that it contains jar files in each subdirectory to catch incorrect paths early.
      const applicationsSubdirectory: string = PathEx.join(localDataLibraryBuildPath, 'apps');
      const librarySubdirectory: string = PathEx.join(localDataLibraryBuildPath, 'lib');
      if (!fs.existsSync(applicationsSubdirectory) || !fs.existsSync(librarySubdirectory)) {
        throw new SoloErrors.validation.localBuildMissingSubdirectories(localDataLibraryBuildPath);
      }
      const applicationsJarFiles: string[] = fs
        .readdirSync(applicationsSubdirectory)
        .filter((file: string): boolean => file.endsWith('.jar'));
      if (applicationsJarFiles.length === 0) {
        throw new SoloErrors.validation.localBuildNoJarFiles(applicationsSubdirectory);
      }
      const libraryJarFiles: string[] = fs
        .readdirSync(librarySubdirectory)
        .filter((file: string): boolean => file.endsWith('.jar'));
      if (libraryJarFiles.length === 0) {
        throw new SoloErrors.validation.localBuildNoJarFiles(librarySubdirectory);
      }

      const k8: K8 = this.k8Factory.getK8(context);

      subTasks.push({
        title: `Copy local build to Node: ${chalk.yellow(nodeAlias)} from ${localDataLibraryBuildPath}`,
        task: async (): Promise<void> => {
          try {
            const retrievedReleaseTag: string = await this.gitClient.describeTag(localDataLibraryBuildPath);
            const expectedReleaseTag: string = releaseTag || HEDERA_PLATFORM_VERSION;
            if (retrievedReleaseTag !== expectedReleaseTag) {
              this.logger.showUser(
                chalk.cyan(
                  `Checkout version ${retrievedReleaseTag} does not match the release version ${expectedReleaseTag}`,
                ),
              );
            }
          } catch {
            // if we can't find the release tag in the local build path directory, we will skip the check and continue
            this.logger.warn('Could not find release tag in local build path directory');
            this.logger.showUser(
              chalk.yellowBright(
                'The release tag could not be verified, please ensure that the release tag passed on the command line ' +
                  'matches the release tag of the code in the local build path directory',
              ),
            );
          }

          // retry copying the build to the node to handle edge cases during performance testing
          for (let retryIndex: number = 0; retryIndex < constants.LOCAL_BUILD_COPY_RETRY; retryIndex++) {
            try {
              // filter the data/config and data/keys to avoid failures due to config and secret mounts
              await this.copyLocalBuildPathToNode(k8, podReference, this.configManager, localDataLibraryBuildPath);
              break;
            } catch (error) {
              // max attempts reached
              if (retryIndex === constants.LOCAL_BUILD_COPY_RETRY - 1) {
                throw new SoloErrors.component.nodeBuildCopyFailed(error);
              }
            }
          }
        },
      });
    }
    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: constants.NODE_COPY_CONCURRENT,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      fallbackRendererOptions: {
        timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
      },
    });
  }

  private async _fetchPlatformSoftware(
    nodeAliases: NodeAliases,
    podReferences: Record<NodeAlias, PodReference>,
    releaseTag: string,
    task: SoloListrTaskWrapper<AnyListrContext>,
    platformInstaller: PlatformInstaller,
    consensusNodes: ConsensusNode[],
    stagingDirectory: string,
  ): Promise<SoloListr<AnyListrContext>> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];
    const [zipPath, checksumPath] = await platformInstaller.getPlatformRelease(stagingDirectory, releaseTag);
    for (const nodeAlias of nodeAliases) {
      const context: string = extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      const podReference: PodReference = podReferences[nodeAlias];
      subTasks.push({
        title: `Update node: ${chalk.yellow(nodeAlias)} [ platformVersion = ${releaseTag}, context = ${context} ]`,
        task: async (): Promise<void> => {
          for (let retryIndex: number = 0; retryIndex < constants.LOCAL_BUILD_COPY_RETRY; retryIndex++) {
            try {
              await platformInstaller.fetchPlatform(podReference, releaseTag, zipPath, checksumPath, context);
              return;
            } catch (error: Error | unknown) {
              if (retryIndex === constants.LOCAL_BUILD_COPY_RETRY - 1) {
                throw error;
              }

              await sleep(Duration.ofSeconds(2));
            }
          }
        },
      });
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true, // since we download in the container directly, we want this to be in parallel across all nodes
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  private _checkNodeActivenessTask(
    context_: AnyListrContext,
    task: SoloListrTaskWrapper<AnyListrContext>,
    nodeAliases: NodeAliases,
    status: NodeStatusCodes = NodeStatusCodes.ACTIVE,
  ): SoloListr<AnyListrContext> {
    const {
      config: {namespace},
    } = context_;

    const enableDebugger: boolean = context_.config.debugNodeAlias && status !== NodeStatusCodes.FREEZE_COMPLETE;
    const debugNodeAlias: NodeAlias | undefined = context_.config.debugNodeAlias;

    const subTasks: {
      title: string;
      task: (context_: AnyListrContext, task: SoloListrTaskWrapper<AnyListrContext>) => Promise<void>;
    }[] = nodeAliases.map(
      (
        nodeAlias,
      ): {
        title: string;
        task: (context_: AnyListrContext, task: SoloListrTaskWrapper<AnyListrContext>) => Promise<void>;
      } => {
        const isDebugNode: boolean = debugNodeAlias === nodeAlias && status !== NodeStatusCodes.FREEZE_COMPLETE;
        const reminder: string = isDebugNode ? 'Please attach JVM debugger now.' : '';
        const title: string = `Check network pod: ${chalk.yellow(nodeAlias)} ${chalk.red(reminder)}`;
        const context: string = extractContextFromConsensusNodes(nodeAlias, this.remoteConfig.getConsensusNodes());

        return {
          title,
          task: async (context_: AnyListrContext, task: SoloListrTaskWrapper<AnyListrContext>): Promise<void> => {
            if (enableDebugger && isDebugNode) {
              await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
                message: `JVM debugger setup for ${nodeAlias}. Continue when debugging is complete?`,
                default: false,
              });
            }

            context_.config.podRefs[nodeAlias] = await this.checkNetworkNodeActiveness(
              namespace,
              nodeAlias,
              task,
              title,
              status,
              undefined,
              undefined,
              undefined,
              context,
            );
          },
        };
      },
    );

    const runSequentially: boolean = enableDebugger || status === NodeStatusCodes.ACTIVE;

    return task.newListr(subTasks, {
      concurrent: !runSequentially, // ACTIVE checks include SDK readiness through shared AccountManager state.
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  public async checkNetworkNodeActiveness(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    task: SoloListrTaskWrapper<AnyListrContext>,
    title: string,
    status: NodeStatusCodes = NodeStatusCodes.ACTIVE,
    maxAttempts: number = constants.NETWORK_NODE_ACTIVE_MAX_ATTEMPTS,
    delay: number = constants.NETWORK_NODE_ACTIVE_DELAY,
    timeout: number = constants.NETWORK_NODE_ACTIVE_TIMEOUT,
    context?: string,
  ): Promise<PodReference> {
    const podName: PodName = Templates.renderNetworkPodName(nodeAlias);
    const podReference: PodReference = PodReference.of(namespace, podName);
    task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt ${chalk.blueBright(`0/${maxAttempts}`)}`;

    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();

    if (typeof context !== 'string' || context.trim().length === 0) {
      context = extractContextFromConsensusNodes(nodeAlias, consensusNodes);
    }

    let attempt: number = 0;
    let success: boolean = false;
    let fatalErrorStreak: number = 0;
    while (attempt < maxAttempts) {
      const controller: AbortController = new AbortController();

      const timeoutId: NodeJS.Timeout = setTimeout((): void => {
        task.title = `${title} - status ${chalk.yellow('TIMEOUT')}, attempt ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
        controller.abort();
      }, timeout);

      try {
        const response: string = await container
          .resolve<NetworkNodes>(InjectTokens.NetworkNodes)
          .getNetworkNodePodStatus(podReference, context);

        if (!response) {
          task.title = `${title} - status ${chalk.yellow('UNKNOWN')}, attempt ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          clearTimeout(timeoutId);
          throw new SoloErrors.component.nodeStatusEmptyResponse();
        }

        const statusLine: string | undefined = response
          .split('\n')
          .find((line: string): boolean => line.startsWith('platform_PlatformStatus'));

        if (!statusLine) {
          task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          clearTimeout(timeoutId);
          throw new SoloErrors.component.nodeStatusMissingLine();
        }

        const statusNumber: number = Number.parseInt(statusLine.split(' ').pop() || '');

        if (statusNumber === status) {
          task.title = `${title} - status ${chalk.green(NodeStatusEnums[status])}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          success = true;
          clearTimeout(timeoutId);
          break;
        } else if (statusNumber === NodeStatusCodes.CATASTROPHIC_FAILURE) {
          task.title = `${title} - status ${chalk.red('CATASTROPHIC_FAILURE')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          break;
        } else if (statusNumber) {
          task.title = `${title} - status ${chalk.yellow(NodeStatusEnums[statusNumber])}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
        }
        clearTimeout(timeoutId);
        fatalErrorStreak = 0;
      } catch (error) {
        this.logger.debug(
          `${title} : Error in checking node activeness: attempt: ${attempt}/${maxAttempts}: ${JSON.stringify(error)}`,
        );

        // The exec call above fails when the container is not currently running (e.g. mid-crash-restart),
        // which is indistinguishable from a slow-starting node without inspecting the container state directly.
        // Detect a non-recoverable crash (CrashLoopBackOff, OOMKilled, ...) and fail fast rather than
        // exhausting the full attempt budget waiting for a process that will never resurrect itself.
        const fatalError: string | undefined = await this.detectFatalNodeContainerError(podReference, context);
        if (fatalError) {
          fatalErrorStreak++;
          if (fatalErrorStreak >= constants.NETWORK_NODE_ACTIVE_FATAL_ERROR_THRESHOLD) {
            task.title = `${title} - status ${chalk.red('CRASHED')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
            clearTimeout(timeoutId);
            throw new SoloErrors.component.nodeContainerCrashed(nodeAlias, fatalError);
          }
        } else {
          fatalErrorStreak = 0;
        }
      }

      attempt++;
      clearTimeout(timeoutId);
      await sleep(Duration.ofMillis(delay));
    }

    if (!success) {
      throw new SoloErrors.component.nodeNotReady(nodeAlias, NodeStatusEnums[status], attempt, maxAttempts);
    }

    if (status === NodeStatusCodes.ACTIVE) {
      await this.waitForGrpcReadiness(namespace, nodeAlias, task, title);
    }

    return podReference;
  }

  /**
   * Best-effort check of the node pod's container state for a non-recoverable crash (e.g.
   * CrashLoopBackOff, OOMKilled). Returns the fatal error description, or undefined when the pod
   * cannot be read or is not in a fatal state, so callers can fall back to normal retry handling.
   */
  private async detectFatalNodeContainerError(
    podReference: PodReference,
    context?: string,
  ): Promise<string | undefined> {
    try {
      const k8: K8 = this.k8Factory.getK8(context);
      const pod: Pod = await k8.pods().read(podReference);
      return k8.pods().detectFatalContainerError(pod);
    } catch {
      // best-effort diagnostic only: if the pod lookup itself fails, defer to the normal retry/timeout handling
      return undefined;
    }
  }

  private async waitForGrpcReadiness(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    task: SoloListrTaskWrapper<AnyListrContext>,
    title: string,
  ): Promise<void> {
    const deployment: DeploymentName = this.configManager.getFlag(flags.deployment);
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

    let attempt: number = 0;
    let consecutiveSuccesses: number = 0;

    while (attempt < constants.NETWORK_NODE_GRPC_READINESS_MAX_ATTEMPTS) {
      try {
        await this.accountManager.refreshNodeClient(namespace, clusterReferences, deployment, true, {
          type: 'only',
          nodeAlias,
        });
        consecutiveSuccesses++;

        task.title =
          `${title} - gRPC readiness ${chalk.green(`${consecutiveSuccesses}/${constants.NETWORK_NODE_GRPC_READINESS_REQUIRED_SUCCESSES}`)}, ` +
          `attempt: ${chalk.blueBright(`${attempt}/${constants.NETWORK_NODE_GRPC_READINESS_MAX_ATTEMPTS}`)}`;

        if (consecutiveSuccesses >= constants.NETWORK_NODE_GRPC_READINESS_REQUIRED_SUCCESSES) {
          return;
        }
      } catch (error) {
        consecutiveSuccesses = 0;

        this.logger.debug(
          `${title} : Error in checking gRPC readiness for node '${nodeAlias}': ` +
            `attempt: ${attempt}/${constants.NETWORK_NODE_GRPC_READINESS_MAX_ATTEMPTS}: ${JSON.stringify(error)}`,
        );

        task.title =
          `${title} - gRPC readiness ${chalk.yellow('WAITING')}, ` +
          `attempt: ${chalk.blueBright(`${attempt}/${constants.NETWORK_NODE_GRPC_READINESS_MAX_ATTEMPTS}`)}`;
      }

      attempt++;
      await sleep(Duration.ofMillis(constants.NETWORK_NODE_GRPC_READINESS_DELAY));
    }

    this.logger.showUser(
      `node '${nodeAlias}' failed gRPC readiness check ` +
        `[ attempt = ${chalk.blueBright(`${attempt}/${constants.NETWORK_NODE_GRPC_READINESS_MAX_ATTEMPTS}`)} ]`,
    );
  }

  /** Return task for check if node proxies are ready */
  private _checkNodesProxiesTask(
    task: SoloListrTaskWrapper<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}>,
    nodeAliases: NodeAliases,
  ): SoloListr<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}> {
    const subTasks: SoloListrTask<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}>[] = [];

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check proxy for node: ${chalk.yellow(nodeAlias)}`,
        task: async (context_): Promise<void> => {
          const context: string = extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);
          const k8: K8 = this.k8Factory.getK8(context);
          const labels: string[] = [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'];

          try {
            await k8
              .pods()
              .waitForReadyStatus(
                context_.config.namespace,
                labels,
                NETWORK_PROXY_INITIAL_READY_ATTEMPTS,
                constants.NETWORK_PROXY_DELAY,
              );
          } catch {
            // HAProxy can remain unready when it starts before its consensus-node backend is available.
            // Recreate only the affected proxy after the node has had time to start, then wait for the
            // replacement rather than spending the full readiness timeout polling a stuck pod.
            const replacementCreatedAfter: Date = new Date();
            const pods: Pod[] = await k8.pods().list(context_.config.namespace, labels);

            this.logger.warn(`HAProxy for node '${nodeAlias}' is not ready; recreating ${pods.length} pod(s)`);
            for (const pod of pods) {
              if (pod.podReference) {
                await k8.pods().delete(pod.podReference);
              }
            }

            await k8
              .pods()
              .waitForReadyStatus(
                context_.config.namespace,
                labels,
                constants.NETWORK_PROXY_MAX_ATTEMPTS,
                constants.NETWORK_PROXY_DELAY,
                replacementCreatedAfter,
                true,
              );
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
  }

  /**
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   */
  private _generateGossipKeys(generateMultiple: boolean): SoloListrTask<NodeKeysContext | NodeAddContext> {
    return {
      title: 'Generate gossip keys',
      task: ({config}, task): SoloListr<AnyListrContext> => {
        const nodeAliases: NodeAlias[] = generateMultiple
          ? (config as NodeKeysConfigClass).nodeAliases
          : [(config as NodeAddConfigClass).nodeAlias];
        const subTasks: SoloListrTask<NodeKeysContext | NodeAddContext>[] = this.keyManager.taskGenerateGossipKeys(
          nodeAliases,
          config.keysDir,
          config.curDate,
        );
        // set up the sub-tasks
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.DEFAULT);
      },
      skip: (context_): boolean => !context_.config.generateGossipKeys,
    };
  }

  /**
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   */
  private _generateGrpcTlsKeys(generateMultiple: boolean): SoloListrTask<NodeKeysContext | NodeAddContext> {
    return {
      title: 'Generate gRPC TLS Keys',
      task: (context_, task): SoloListr<NodeKeysContext | NodeAddContext> => {
        const config: NodeAddConfigClass | NodeKeysConfigClass = context_.config;
        const nodeAliases: NodeAlias[] = generateMultiple
          ? (config as NodeKeysConfigClass).nodeAliases
          : [(config as NodeAddConfigClass).nodeAlias];
        const subTasks: SoloListrTask<AnyListrContext>[] = this.keyManager.taskGenerateTLSKeys(
          nodeAliases,
          config.keysDir,
          config.curDate,
        );
        // set up the sub-tasks
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
      skip: (context_): boolean => !context_.config.generateTlsKeys,
    };
  }

  public copyGrpcTlsCertificates(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Copy gRPC TLS Certificates',
      task: ({config}, task): SoloListr<AnyListrContext> =>
        this.certificateManager.buildCopyTlsCertificatesTasks(
          task,
          config.grpcTlsCertificatePath,
          config.grpcWebTlsCertificatePath,
          config.grpcTlsKeyPath,
          config.grpcWebTlsKeyPath,
        ),
      skip: (context_): boolean =>
        !context_.config.grpcTlsCertificatePath && !context_.config.grpcWebTlsCertificatePath,
    };
  }

  private async _addStake(
    namespace: NamespaceName,
    accountId: string,
    nodeAlias: NodeAlias,
    stakeAmount: number = HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
  ): Promise<void> {
    const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
    await this.accountManager.loadNodeClient(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deploymentName,
      this.configManager.getFlag<boolean>(flags.forcePortForward),
    );
    const client: Client = this.accountManager._nodeClient;
    const treasuryKey: AccountIdWithKeyPairObject = await this.accountManager.getTreasuryAccountKeys(
      namespace,
      deploymentName,
    );

    const treasuryPrivateKey: PrivateKey = PrivateKey.fromStringED25519(treasuryKey.privateKey);
    const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deploymentName);
    client.setOperator(treasuryAccountId, treasuryPrivateKey);

    // check balance
    let treasuryAccountInfo: AccountInfo;
    try {
      treasuryAccountInfo = await new AccountInfoQuery().setAccountId(treasuryAccountId).execute(client);
    } catch (error) {
      throw new SoloErrors.component.accountBalanceQueryFailed(treasuryAccountId, error);
    }

    this.logger.debug(`Account ${treasuryAccountId} balance: ${treasuryAccountInfo.balance}`);

    // get some initial balance
    await this.accountManager.transferAmount(treasuryAccountId, accountId, stakeAmount);

    // check balance
    let accountInfo: AccountInfo;
    try {
      accountInfo = await new AccountInfoQuery().setAccountId(accountId).execute(client);
    } catch (error) {
      throw new SoloErrors.component.accountBalanceQueryFailed(accountId, error);
    }
    this.logger.debug(`Account ${accountId} balance: ${accountInfo.balance}`);

    // Create the transaction
    const transaction: AccountUpdateTransaction = new AccountUpdateTransaction()
      .setAccountId(accountId)
      .setStakedNodeId(Templates.nodeIdFromNodeAlias(nodeAlias))
      .freezeWith(client);

    // Sign the transaction with the account's private key
    const signTransaction: AccountUpdateTransaction = await transaction.sign(treasuryPrivateKey);

    let transactionResponse: TransactionResponse;
    let receipt: TransactionReceipt;
    try {
      transactionResponse = await signTransaction.execute(client);
      receipt = await transactionResponse.getReceipt(client);
    } catch (error) {
      throw new SoloErrors.component.nodeStakeTransactionError(error);
    }

    this.logger.debug(`The transaction consensus status is ${receipt.status}`);
  }

  public prepareUpgradeZip(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Prepare upgrade zip file for node upgrade process',
      task: async (context_): Promise<void> => {
        const config: NodeAddConfigClass | NodeUpdateConfigClass | NodeUpgradeConfigClass | NodeDestroyConfigClass =
          context_.config;
        const {upgradeZipFile, deployment} = context_.config;
        if (upgradeZipFile) {
          context_.upgradeZipFile = upgradeZipFile;
          this.logger.debug(`Using upgrade zip file: ${context_.upgradeZipFile}`);
        } else {
          // download application.properties from the first node in the deployment
          const nodeAlias: NodeAlias = config.existingNodeAliases[0];

          const nodeFullyQualifiedPodName: PodName = Templates.renderNetworkPodName(nodeAlias);
          const podReference: PodReference = PodReference.of(config.namespace, nodeFullyQualifiedPodName);
          const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

          const context: string = extractContextFromConsensusNodes(
            (context_ as NodeUpdateContext | NodeDestroyContext).config.nodeAlias,
            context_.config.consensusNodes,
          );

          const templatesDirectory: string = PathEx.join(config.stagingDir, 'templates');
          fs.mkdirSync(templatesDirectory, {recursive: true});

          await this.k8Factory
            .getK8(context)
            .containers()
            .readByRef(containerReference)
            .copyFrom(
              `${constants.HEDERA_HAPI_PATH}/data/config/${constants.APPLICATION_PROPERTIES}`,
              templatesDirectory,
            );

          const upgradeVersion: string | undefined =
            'upgradeVersion' in config ? (config.upgradeVersion as string) : undefined;
          context_.upgradeZipFile = await this._prepareUpgradeZip(config.stagingDir, upgradeVersion);
        }
        context_.upgradeZipHash = await this._uploadUpgradeZip(context_.upgradeZipFile, config.nodeClient, deployment);
      },
    };
  }

  public loadAdminKey(): SoloListrTask<NodeUpdateContext | NodeUpgradeContext | NodeDestroyContext> {
    return {
      title: 'Load node admin key',
      task: async (context_): Promise<void> => {
        const config: NodeUpdateConfigClass | NodeUpgradeConfigClass | NodeDestroyConfigClass = context_.config;
        if ((context_ as NodeUpdateContext | NodeDestroyContext).config.nodeAlias) {
          try {
            const context: string = extractContextFromConsensusNodes(
              (context_ as NodeUpdateContext | NodeDestroyContext).config.nodeAlias,
              context_.config.consensusNodes,
            );

            // load nodeAdminKey from k8s if exist
            const keyFromK8: Secret = await this.k8Factory
              .getK8(context)
              .secrets()
              .read(
                config.namespace,
                Templates.renderNodeAdminKeyName((context_ as NodeUpdateContext | NodeDestroyContext).config.nodeAlias),
              );
            const privateKey: string = Base64.decode(keyFromK8.data.privateKey);
            config.adminKey = PrivateKey.fromStringED25519(privateKey);
          } catch (error) {
            this.logger.debug(`Error in loading node admin key: ${error.message}, use default key`);
            config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
          }
        } else {
          config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        }
      },
    };
  }

  public checkExistingNodesStakedAmount(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    return {
      title: 'Check existing nodes staked amount',
      task: async ({config}): Promise<void> => {
        // Transfer some hbar to the node for staking purpose
        const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
        const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(
          config.existingNodeAliases,
          deploymentName,
        );
        const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deploymentName);
        for (const nodeAlias of config.existingNodeAliases) {
          const accountId: string = accountMap.get(nodeAlias)!;
          await this.accountManager.transferAmount(treasuryAccountId, accountId, 1);
        }
      },
    };
  }

  public sendPrepareUpgradeTransaction(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    return {
      title: 'Send prepare upgrade transaction',
      task: async (context_): Promise<void> => {
        const {upgradeZipHash} = context_;
        const {nodeClient, freezeAdminPrivateKey, deployment} = context_.config;
        const freezeAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
        const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deployment);

        // query the balance
        let accountInfo: AccountInfo;
        try {
          accountInfo = await new AccountInfoQuery().setAccountId(freezeAccountId).execute(nodeClient);
        } catch (error) {
          throw new SoloErrors.component.accountBalanceQueryFailed(freezeAccountId, error);
        }

        this.logger.debug(`Freeze admin account balance: ${accountInfo.balance}`);

        // transfer some tiny amount to the freeze admin account
        await this.accountManager.transferAmount(treasuryAccountId, freezeAccountId, 100_000);

        // set operator of freeze transaction as freeze admin account
        nodeClient.setOperator(freezeAccountId, freezeAdminPrivateKey);

        let prepareUpgradeTransaction: TransactionResponse;
        let prepareUpgradeReceipt: TransactionReceipt;
        try {
          prepareUpgradeTransaction = await new FreezeTransaction()
            .setFreezeType(FreezeType.PrepareUpgrade)
            .setFileId(this.getFileUpgradeId(deployment))
            .setFileHash(upgradeZipHash)
            .freezeWith(nodeClient)
            .execute(nodeClient);
          prepareUpgradeReceipt = await prepareUpgradeTransaction.getReceipt(nodeClient);
        } catch (error) {
          throw new SoloErrors.component.nodePrepareUpgradeTransactionError(error);
        }

        this.logger.debug(
          `sent prepare upgrade transaction [id: ${prepareUpgradeTransaction.transactionId.toString()}]`,
          prepareUpgradeReceipt.status.toString(),
        );

        if (prepareUpgradeReceipt.status !== Status.Success) {
          throw new SoloErrors.component.nodeTransactionFailed(
            'Prepare upgrade',
            prepareUpgradeReceipt.status.toString(),
          );
        }
      },
    };
  }

  public sendFreezeUpgradeTransaction(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    return {
      title: 'Send freeze upgrade transaction',
      task: async (context_): Promise<void> => {
        const {upgradeZipHash} = context_;
        const {freezeAdminPrivateKey, nodeClient, deployment} = context_.config;
        const futureDate: Date = new Date();
        this.logger.debug(`Current time: ${futureDate}`);

        futureDate.setTime(futureDate.getTime() + 5000); // 5 seconds in the future
        this.logger.debug(`Freeze time: ${futureDate}`);

        const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);

        // query the balance
        let accountInfo: AccountInfo;
        try {
          accountInfo = await new AccountInfoQuery().setAccountId(freezeAdminAccountId).execute(nodeClient);
        } catch (error) {
          throw new SoloErrors.component.accountBalanceQueryFailed(freezeAdminAccountId, error);
        }

        this.logger.debug(`Freeze admin account balance: ${accountInfo.balance}`);

        nodeClient.setOperator(freezeAdminAccountId, freezeAdminPrivateKey);
        let freezeUpgradeReceipt: TransactionReceipt;
        let freezeUpgradeTx: TransactionResponse;
        try {
          freezeUpgradeTx = await new FreezeTransaction()
            .setFreezeType(FreezeType.FreezeUpgrade)
            .setStartTimestamp(Timestamp.fromDate(futureDate))
            .setFileId(this.getFileUpgradeId(deployment))
            .setFileHash(upgradeZipHash)
            .freezeWith(nodeClient)
            .execute(nodeClient);
          freezeUpgradeReceipt = await freezeUpgradeTx.getReceipt(nodeClient);
        } catch (error) {
          throw new SoloErrors.component.nodeFreezeUpgradeTransactionError(error);
        }

        this.logger.debug(
          `Upgrade frozen with transaction id: ${freezeUpgradeTx.transactionId.toString()}`,
          freezeUpgradeReceipt.status.toString(),
        );
      },
    };
  }

  public sendFreezeTransaction(): SoloListrTask<NodeFreezeContext> {
    return {
      title: 'Send freeze only transaction',
      task: async (context_): Promise<void> => {
        const {freezeAdminPrivateKey, deployment, namespace} = context_.config;
        const nodeClient: Client = await this.accountManager.loadNodeClient(
          namespace,
          this.remoteConfig.getClusterRefs(),
          deployment,
        );
        const futureDate: Date = new Date();
        this.logger.debug(`Current time: ${futureDate}`);

        futureDate.setTime(futureDate.getTime() + 5000); // 5 seconds in the future
        this.logger.debug(`Freeze time: ${futureDate}`);

        const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
        nodeClient.setOperator(freezeAdminAccountId, freezeAdminPrivateKey);
        let freezeOnlyTransaction: TransactionResponse;
        let freezeOnlyReceipt: TransactionReceipt;
        try {
          freezeOnlyTransaction = await new FreezeTransaction()
            .setFreezeType(FreezeType.FreezeOnly)
            .setStartTimestamp(Timestamp.fromDate(futureDate))
            .freezeWith(nodeClient)
            .execute(nodeClient);
          freezeOnlyReceipt = await freezeOnlyTransaction.getReceipt(nodeClient);
        } catch (error) {
          throw new SoloErrors.component.nodeFreezeTransactionError(error);
        }

        this.logger.debug(
          `sent prepare transaction [id: ${freezeOnlyTransaction.transactionId.toString()}]`,
          freezeOnlyReceipt.status.toString(),
        );
      },
    };
  }

  /** Download generated config files and key files from the network node,
   *  This function should only be called when updating or destroying a node
   * */
  public downloadNodeGeneratedFilesForDynamicAddressBook(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext
  > {
    return {
      title: 'Download generated files from an existing node',
      task: async ({
        config: {nodeAlias, existingNodeAliases, consensusNodes, stagingDir, keysDir, namespace},
      }): Promise<void> => {
        // don't try to download from the same node we are deleting, it won't work
        const targetNodeAlias: NodeAlias =
          nodeAlias === existingNodeAliases[0] && existingNodeAliases.length > 1
            ? existingNodeAliases[1]
            : existingNodeAliases[0];

        const nodeFullyQualifiedPodName: PodName = Templates.renderNetworkPodName(targetNodeAlias);
        const podReference: PodReference = PodReference.of(namespace, nodeFullyQualifiedPodName);
        const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

        const context: Context = extractContextFromConsensusNodes(targetNodeAlias, consensusNodes);

        const k8Container: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);

        // if directory data/upgrade/current/data/keys does not exist, then use data/upgrade/current
        let keyDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/keys`;

        if (!(await k8Container.hasDir(keyDirectory))) {
          keyDirectory = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`;
        }

        const signedKeyFiles: TDirectoryData[] = await k8Container
          .listDir(keyDirectory)
          .then((files: TDirectoryData[]): TDirectoryData[] =>
            files.filter((file: TDirectoryData): boolean => file.name.startsWith(constants.SIGNING_KEY_PREFIX)),
          );

        await k8Container.execContainer([
          'bash',
          '-c',
          `mkdir -p ${constants.HEDERA_HAPI_PATH}/data/keys_backup && cp -r ${keyDirectory} ${constants.HEDERA_HAPI_PATH}/data/keys_backup/`,
        ]);

        for (const signedKeyFile of signedKeyFiles) {
          await k8Container.copyFrom(`${keyDirectory}/${signedKeyFile.name}`, `${keysDir}`);
        }

        const applicationPropertiesSourceDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/config/${constants.APPLICATION_PROPERTIES}`;

        await ((await k8Container.hasFile(applicationPropertiesSourceDirectory))
          ? k8Container.copyFrom(applicationPropertiesSourceDirectory, `${stagingDir}/templates`)
          : k8Container.copyFrom(
              `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/config/${constants.APPLICATION_PROPERTIES}`,
              `${stagingDir}/templates`,
            ));
      },
    };
  }

  public downloadNodeUpgradeFiles(): SoloListrTask<NodeUpgradeContext> {
    return {
      title: 'Download upgrade files from an existing node',
      task: async (context_): Promise<void> => {
        const {consensusNodes, namespace, stagingDir, nodeAliases}: NodeUpgradeConfigClass = context_.config;

        const nodeAlias: NodeAlias = nodeAliases[0];
        const context: string = extractContextFromConsensusNodes(nodeAlias, consensusNodes);

        const container: Container = await new K8Helper(context).getConsensusNodeRootContainer(namespace, nodeAlias);

        fs.mkdirSync(stagingDir, {recursive: true});

        // found all files under ${constants.HEDERA_HAPI_PATH}/data/upgrade/current/
        const upgradeDirectories: string[] = [
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`,
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/apps`,
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/lib`,
        ];

        for (const upgradeDirectory of upgradeDirectories) {
          // check if directory upgradeDirectory exist in root container
          if (!(await container.hasDir(upgradeDirectory))) {
            continue;
          }
          const files: TDirectoryData[] = await container.listDir(upgradeDirectory);
          // iterate all files and copy them to the staging directory
          for (const file of files) {
            if (file.name.endsWith('.mf')) {
              continue;
            }
            if (file.directory) {
              continue;
            }
            this.logger.debug(`Copying file: ${file.name}`);
            await container.copyFrom(`${upgradeDirectory}/${file.name}`, `${stagingDir}`);
          }
        }
      },
    };
  }

  private taskCheckNetworkNodePods(
    context_: CheckedNodesContext,
    task: SoloListrTaskWrapper<CheckedNodesContext>,
    nodeAliases: NodeAliases,
    maxAttempts?: number,
  ): SoloListr<CheckedNodesContext> {
    context_.config.podRefs = {};
    const consensusNodes: ConsensusNode[] = context_.config.consensusNodes;

    const subTasks: SoloListrTask<CheckedNodesContext>[] = [];

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check network pod: ${chalk.yellow(nodeAlias)}`,
        task: async ({config}): Promise<void> => {
          try {
            const context: Context = extractContextFromConsensusNodes(nodeAlias, consensusNodes);

            config.podRefs[nodeAlias] = await this.checkNetworkNodePod(
              config.namespace,
              nodeAlias,
              maxAttempts,
              undefined,
              context,
            );
          } catch {
            config.skipStop = true;
          }
        },
      });
    }

    // setup the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  /** Check if the network node pod is running */
  private async checkNetworkNodePod(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    maxAttempts: number = constants.PODS_RUNNING_MAX_ATTEMPTS,
    delay: number = constants.PODS_RUNNING_DELAY,
    context?: Optional<string>,
  ): Promise<PodReference> {
    nodeAlias = nodeAlias.trim() as NodeAlias;
    const podName: PodName = Templates.renderNetworkPodName(nodeAlias);
    const podReference: PodReference = PodReference.of(namespace, podName);

    if (typeof context !== 'string' || context.trim().length === 0) {
      context = extractContextFromConsensusNodes(nodeAlias, this.remoteConfig.getConsensusNodes());
    }

    try {
      await this.k8Factory
        .getK8(context)
        .pods()
        .waitForRunningPhase(
          namespace,
          [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'],
          maxAttempts,
          delay,
        );

      return podReference;
    } catch (error) {
      throw new SoloErrors.system.podNotFound(nodeAlias, error);
    }
  }

  public loadConfiguration(
    argv: ArgvStruct,
    leaseWrapper: LeaseWrapper,
    leaseManager: LockManager,
    validateRemoteConfig: boolean = true,
  ) {
    return {
      title: 'Load configuration',
      task: async () => {
        await this.localConfig.load();
        await this.remoteConfig.loadAndValidate(argv, validateRemoteConfig);
        if (!this.oneShotState.isActive()) {
          leaseWrapper.lease = await leaseManager.create();
        }
      },
    };
  }

  /**
   * Resolve the active node aliases and their service map for the given namespace/deployment.
   * Nodes whose accountId equals {@link constants.IGNORED_NODE_ACCOUNT_ID} are excluded.
   *
   * Shared by {@link getExistingNodeAliases} (non-task callers) and
   * {@link identifyExistingNodes} (Listr task) to avoid duplicating the
   * `getNodeServiceMap` + filter loop in both places.
   */
  private async resolveExistingNodes(
    namespace: NamespaceName,
    deployment: DeploymentName,
  ): Promise<{existingNodeAliases: NodeAliases; serviceMap: NodeServiceMapping}> {
    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();
    const serviceMap: NodeServiceMapping = await this.accountManager.getNodeServiceMap(
      namespace,
      clusterReferences,
      deployment,
    );
    const existingNodeAliases: NodeAliases = [];
    for (const networkNodeServices of serviceMap.values()) {
      if (networkNodeServices.accountId === constants.IGNORED_NODE_ACCOUNT_ID) {
        continue;
      }
      existingNodeAliases.push(networkNodeServices.nodeAlias);
    }
    return {existingNodeAliases, serviceMap};
  }

  public async getExistingNodeAliases(namespace: NamespaceName, deployment: DeploymentName): Promise<NodeAliases> {
    const {existingNodeAliases} = await this.resolveExistingNodes(namespace, deployment);
    return existingNodeAliases;
  }

  public identifyExistingNodes(): SoloListrTask<CheckedNodesContext> {
    return {
      title: 'Identify existing network nodes',
      task: async (context_, task): Promise<any> => {
        const config: CheckedNodesConfigClass = context_.config;
        ({existingNodeAliases: config.existingNodeAliases, serviceMap: config.serviceMap} =
          await this.resolveExistingNodes(config.namespace, config.deployment));
        config.allNodeAliases = [...config.existingNodeAliases];
        return this.taskCheckNetworkNodePods(context_, task, config.existingNodeAliases);
      },
    };
  }
  public uploadStateFiles(skip: SkipCheck | boolean, stateFileDirectory?: string) {
    return {
      title: 'Upload state files network nodes',
      task: async (context_): Promise<void> => {
        const config: NodeAddConfigClass & {stateFile?: string} = context_.config;

        for (const nodeAlias of context_.config.nodeAliases) {
          const kubeContext: Optional<string> = extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);

          if (!kubeContext) {
            throw new SoloErrors.system.kubeContextNotFound(nodeAlias);
          }

          const k8: K8 = this.k8Factory.getK8(kubeContext);
          const podReference: PodReference = context_.config.podRefs[nodeAlias];
          const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
          const consensusNode: ConsensusNode = config.consensusNodes.find((node): boolean => node.name === nodeAlias);

          if (!consensusNode) {
            throw new SoloErrors.system.consensusNodeNotInConfig(nodeAlias);
          }

          const clusterReference: ClusterReferenceName = consensusNode.cluster ?? kubeContext;
          const targetNodeId: NodeId = consensusNode.nodeId;
          const container: Container = k8.containers().readByRef(containerReference);

          // Determine the state file to use
          let zipFile: string;
          let stateInputPath: string = stateFileDirectory || config.stateFile;

          if (!stateInputPath || !fs.existsSync(stateInputPath)) {
            throw new SoloErrors.validation.stateFilePathNotFound(stateInputPath);
          }

          stateInputPath = PathEx.resolve(stateInputPath);

          // sourceNodeId tracks which node's state directory is inside the zip so the
          // rename-state-node-id script can move it to the right place.
          let sourceNodeId: NodeId;

          if (fs.statSync(stateInputPath).isDirectory()) {
            // Directory restore: each pod has its own zip that was captured from that same
            // pod.  The zip therefore already contains the correct node-ID directory for the
            // target pod, so no rename is required.
            sourceNodeId = targetNodeId;

            const podName: string = podReference.name.name;
            const statesDirectory: string = PathEx.join(
              stateInputPath,
              'states',
              clusterReference,
              config.namespace.name,
            );

            if (!fs.existsSync(statesDirectory)) {
              this.logger.showUserError(`No states directory found for node ${nodeAlias} at ${statesDirectory}`);
              throw new SoloErrors.system.statesDirectoryNotFound(nodeAlias, statesDirectory);
            }

            const stateFiles: string[] = fs
              .readdirSync(statesDirectory)
              .filter((file): boolean => file.startsWith(podName) && file.endsWith('-state.zip'));

            if (stateFiles.length === 0) {
              this.logger.info(`No state file found for pod ${podName} (node: ${nodeAlias})`);
              this.logger.showUserError(`No state file found for pod ${podName} (node: ${nodeAlias})`);
              continue;
            }

            zipFile = PathEx.join(statesDirectory, stateFiles[0]);
            this.logger.info(`Using state file for node ${nodeAlias}: ${stateFiles[0]}`);
          } else {
            // Single-file restore (e.g. node add): the zip is from the first consensus node
            // and needs to be renamed to match each target node.
            sourceNodeId = config.consensusNodes[0].nodeId;
            zipFile = stateInputPath;
          }

          if (!zipFile.endsWith('.zip')) {
            throw new SoloErrors.validation.invalidStateFileFormat(zipFile);
          }

          if (!fs.existsSync(zipFile) || !fs.statSync(zipFile).isFile()) {
            throw new SoloErrors.validation.stateFileNotFound(zipFile);
          }

          const zipFileName: string = PathEx.basename(zipFile);

          // The zip filename is later passed to `unzip` inside the container.
          // Keep the accepted filename format intentionally small so user input cannot
          // be interpreted as command options, path traversal, shell syntax, or nested paths.
          if (zipFileName.startsWith('-') || !/^[a-zA-Z0-9._-]+$/.test(zipFileName)) {
            throw new SoloErrors.validation.invalidStateZipFileName(zipFileName);
          }

          this.logger.debug(`Uploading state files to pod ${podReference.name}`);
          await container.copyTo(zipFile, `${constants.HEDERA_HAPI_PATH}/data`);

          this.logger.info(
            `Deleting the previous state files in pod ${podReference.name} directory ${constants.HEDERA_HAPI_PATH}/data/saved`,
          );

          await container.execContainer(['bash', '-c', `rm -rf ${constants.HEDERA_HAPI_PATH}/data/saved/*`]);

          await container.execContainer([
            'unzip',
            '-o',
            `${constants.HEDERA_HAPI_PATH}/data/${zipFileName}`,
            '-d',
            `${constants.HEDERA_HAPI_PATH}/data/saved`,
          ]);

          // Fix ownership of extracted state files to hedera user
          // NOTE: zip doesn't preserve Unix ownership - files are owned by whoever runs unzip (root).
          // Unlike tar which preserves UID/GID metadata, zip format doesn't store Unix ownership info.
          // The chown is required so the hedera process can access the extracted state files.
          this.logger.info(`Fixing ownership of extracted state files in pod ${podReference.name}`);

          await container.execContainer([
            'bash',
            '-c',
            `chown -R hedera:hedera ${constants.HEDERA_HAPI_PATH}/data/saved`,
          ]);

          // Rename node ID directories to match the target node
          if (sourceNodeId !== targetNodeId) {
            this.logger.info(
              `Renaming node ID directories in pod ${podReference.name} from ${sourceNodeId} to ${targetNodeId}`,
            );

            const renameScriptName: string = PathEx.basename(constants.RENAME_STATE_NODE_ID_SCRIPT);
            const renameScriptDestination: string = `${constants.HEDERA_USER_HOME_DIR}/${renameScriptName}`;

            await container.execContainer(['mkdir', '-p', constants.HEDERA_USER_HOME_DIR]);
            await container.copyTo(constants.RENAME_STATE_NODE_ID_SCRIPT, constants.HEDERA_USER_HOME_DIR);
            await container.execContainer(['chmod', '+x', renameScriptDestination]);

            await container.execContainer([
              renameScriptDestination,
              constants.HEDERA_HAPI_PATH,
              sourceNodeId.toString(),
              targetNodeId.toString(),
            ]);
          }

          await container.execContainer([
            'bash',
            '-c',
            `chown -R hedera:hedera ${constants.HEDERA_HAPI_PATH}/data/saved`,
          ]);
        }
      },
      skip,
    };
  }

  public identifyNetworkPods(maxAttempts?: number) {
    return {
      title: 'Identify network pods',
      task: (context_, task) => {
        return this.taskCheckNetworkNodePods(context_, task, context_.config.nodeAliases, maxAttempts);
      },
    };
  }

  public fetchPlatformSoftware(
    aliasesField: string,
  ): SoloListrTask<
    NodeUpgradeContext | NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext | NodeSetupContext
  > {
    return {
      title: 'Fetch platform software into network nodes',
      task: async (context_, task): Promise<SoloListr<AnyListrContext> | void> => {
        const {podRefs, localBuildPath} = context_.config;
        let {releaseTag} = context_.config;

        if (releaseTag) {
          releaseTag = SemanticVersion.getValidSemanticVersion(releaseTag, true, 'Consensus release tag');
        }

        if ('upgradeVersion' in context_.config) {
          if (context_.config.upgradeVersion) {
            releaseTag = context_.config.upgradeVersion;
          } else if (!localBuildPath) {
            this.logger.info('Skip, no need to update the platform software');
            return;
          }
        }

        context_.config.releaseTag = releaseTag;

        if (!localBuildPath) {
          return this._fetchPlatformSoftware(
            context_.config[aliasesField],
            podRefs,
            releaseTag,
            task,
            this.platformInstaller,
            context_.config.consensusNodes,
            context_.config.stagingDir,
          );
        }

        const nodeAliases: NodeAliases = context_.config[aliasesField] as NodeAliases;
        const uniqueContexts: Context[] = [
          ...new Set(
            nodeAliases.map((nodeAlias: NodeAlias): Context =>
              extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes),
            ),
          ),
        ];
        await this.validateNodePvcsForLocalBuildPath(context_.config.namespace, uniqueContexts);

        return this._uploadPlatformSoftware(
          nodeAliases,
          podRefs,
          task,
          localBuildPath,
          context_.config.consensusNodes,
          releaseTag,
        );
      },
    };
  }

  public updateConsensusNodeVersionInRemoteConfig(): SoloListrTask<NodeUpgradeContext> {
    return {
      title: 'Update consensus node version in remote config',
      task: async ({config}, task): Promise<void> => {
        if (!config.releaseTag) {
          // upgrades performed with --local-build-path do not resolve a semantic release tag,
          // so there is no version to record in remote config
          task.skip(
            `${task.title} ${chalk.yellow('[SKIPPING]')} ${chalk.grey('no release tag resolved for this upgrade')}`,
          );

          return;
        }

        this.remoteConfig.updateComponentVersion(
          ComponentTypes.ConsensusNode,
          new SemanticVersion<string>(config.releaseTag),
        );
        await this.remoteConfig.persist();
      },
    };
  }

  public populateServiceMap(): SoloListrTask<NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Populate serviceMap',
      task: async (context_): Promise<void> => {
        context_.config.serviceMap = await this.accountManager.getNodeServiceMap(
          context_.config.namespace,
          this.remoteConfig.getClusterRefs(),
          context_.config.deployment,
        );
        if (!context_.config.serviceMap.has(context_.config.nodeAlias)) {
          return;
        }

        context_.config.podRefs[context_.config.nodeAlias] = PodReference.of(
          context_.config.namespace,
          context_.config.serviceMap.get(context_.config.nodeAlias).nodePodName,
        );
      },
    };
  }

  public setupNetworkNodes(
    nodeAliasesProperty: string,
    isGenesis: boolean,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext> {
    return {
      title: 'Setup network nodes',
      task: async (
        {config},
        task,
      ): Promise<SoloListr<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext>> => {
        if (!config.nodeAliases || config.nodeAliases.length === 0) {
          config.nodeAliases = parseNodeAliases(
            config.nodeAliasesUnparsed,
            this.remoteConfig.getConsensusNodes(),
            this.configManager,
          );
        }
        if (isGenesis) {
          await this.generateGenesisNetworkJson(
            config.namespace,
            config.consensusNodes,
            config.stagingDir,
            config.domainNamesMapping,
            config.gossipEndpointPortMapping,
            config.serviceEndpointPortMapping,
          );
        }

        await this.generateNodeOverridesJson(config.namespace, config.nodeAliases, config.stagingDir);

        const subTasks: SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext>[] =
          [];

        for (const nodeAlias of config[nodeAliasesProperty]) {
          const context: Context = extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);

          subTasks.push({
            title: `Node: ${chalk.yellow(nodeAlias)}`,
            task: (): SoloListr<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext> =>
              this.platformInstaller.taskSetup(config.podRefs[nodeAlias], config.stagingDir, isGenesis, context),
          });
        }

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  public setupNetworkNodeFolders(): SoloListrTask<NodeSetupContext> {
    return {
      title: 'setup network node folders',
      task: async (context_): Promise<void> => {
        for (const consensusNode of context_.config.consensusNodes) {
          const context: string = extractContextFromConsensusNodes(consensusNode.name, context_.config.consensusNodes);
          const podReference: PodReference = await this.k8Factory
            .getK8(context)
            .pods()
            .list(NamespaceName.of(consensusNode.namespace), [
              `solo.hedera.com/node-name=${consensusNode.name}`,
              'solo.hedera.com/type=network-node',
            ])
            .then((pods: Pod[]): PodReference => pods[0].podReference);

          const rootContainer: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

          const container: Container = this.k8Factory
            .getK8(consensusNode.context)
            .containers()
            .readByRef(rootContainer);

          await container.execContainer('chmod 750 /opt/hgcapp/services-hedera/HapiApp2.0/data');

          // save consensus node version in remote config
          this.remoteConfig.updateComponentVersion(
            ComponentTypes.ConsensusNode,
            new SemanticVersion<string>(context_.config.releaseTag),
          );
          await this.remoteConfig.persist();
        }
      },
    };
  }

  public showUserMessages(): SoloListrTask<NodeStartContext> {
    return {
      title: 'Show user messages',
      task: (): void => {
        this.logger.showAllMessageGroups();
      },
    };
  }

  public waitForTss(): SoloListrTask<NodeStartContext> {
    return {
      title: 'Wait for TSS',
      skip: (): boolean => !this.remoteConfig.configuration.state.tssEnabled,
      task: async ({config}, task): Promise<SoloListr<NodeStartContext>> => {
        const subTasks: SoloListrTask<NodeStartContext>[] = [];

        for (const node of config.consensusNodes) {
          subTasks.push({
            title: `Waiting for node: ${node.name}`,
            task: async (_, task): Promise<void> => {
              const maxAttempts: number = this.soloConfig.tss.readyMaxAttempts;
              let attempt: number = 0;
              let success: boolean = false;

              while (!success && attempt < maxAttempts) {
                attempt++;

                task.title = `Waiting for node: ${chalk.cyan(node.name)}, attempt ${chalk.cyan(`${attempt}/${maxAttempts}`)}`;

                const container: Container = await new K8Helper(node.context).getConsensusNodeRootContainer(
                  NamespaceName.of(node.namespace),
                  node.name,
                );

                const hgcaaLogPath: string = `${constants.HEDERA_HAPI_PATH}/output/hgcaa.log`;

                const output: string = await container.execContainer(['cat', hgcaaLogPath]);

                if (output.includes('TSS protocol ready to sign blocks')) {
                  await sleep(Duration.ofSeconds(this.soloConfig.tss.timeoutAfterReadySeconds));
                  success = true;
                } else {
                  await sleep(Duration.ofSeconds(this.soloConfig.tss.readyBackoffSeconds));
                }
              }

              if (!success) {
                throw new SoloErrors.component.nodeNotReady(node.name, 'TSS Ready', maxAttempts, maxAttempts);
              }
            },
          });
        }

        return task.newListr(subTasks, {concurrent: true, rendererOptions: {collapseSubtasks: false}});
      },
    };
  }

  public setGrpcWebEndpoint(
    nodeAliasesProperty: string,
    subcommandType: NodeSubcommandType,
  ): SoloListrTask<NodeStartContext> {
    return {
      title: 'set gRPC Web endpoint',
      skip: ({config: {app}}): boolean => {
        // skip setting the gRPC Web endpoint if we are not running a Consensus Node
        if (app !== constants.HEDERA_APP_NAME) {
          return true;
        }
        // skip if caller opted out (e.g. restore flow where endpoint is already correct
        // in the restored state and re-sending triggers the CN v0.74 CHECKING bug)
        if (this.configManager.getFlag<boolean>(flags.skipGrpcWebEndpoint)) {
          return true;
        }
        return false;
      },
      task: async ({config}): Promise<void> => {
        const {namespace, deployment, adminKey} = config;

        const serviceMap: NodeServiceMapping = await this.accountManager.getNodeServiceMap(
          namespace,
          this.remoteConfig.getClusterRefs(),
          deployment,
        );

        const grpcWebEndpoints: NodeAliasToAddressMapping = Templates.parseNodeAliasToAddressAndPortMapping(
          config.grpcWebEndpoints,
          this.remoteConfig.getConsensusNodes(),
        );

        for (const nodeAlias of config[nodeAliasesProperty]) {
          const networkNodeService: NetworkNodeServices = serviceMap.get(nodeAlias);

          const cluster: Readonly<ClusterSchema> = this.remoteConfig.configuration.clusters.find(
            (cluster: Readonly<ClusterSchema>): boolean => cluster.namespace === namespace.name,
          );

          const grpcProxyPort: number = +networkNodeService.envoyProxyGrpcWebPort;

          const nodeClient: Client = await this.accountManager.loadNodeClient(
            namespace,
            this.remoteConfig.getClusterRefs(),
            deployment,
          );

          const grpcWebProxyEndpoint: ServiceEndpoint = new ServiceEndpoint();

          let endpoint: {address: string; port: number};

          if (subcommandType === NodeSubcommandType.ADD && (config as any).grpcWebEndpoint) {
            const grpcWebEndpoint: string = (config as any).grpcWebEndpoint;

            const [address, port] = grpcWebEndpoint.includes(':')
              ? grpcWebEndpoint.split(':')
              : [grpcWebEndpoint, constants.GRPC_WEB_PORT];

            endpoint = {address, port: +port};
          } else if (subcommandType === NodeSubcommandType.START) {
            endpoint = grpcWebEndpoints[nodeAlias];
          }

          if (endpoint) {
            grpcWebProxyEndpoint.setDomainName(endpoint.address).setPort(endpoint.port);
          } else if (networkNodeService.envoyProxyLoadBalancerIp) {
            const svc: Service[] = await this.k8Factory
              .getK8(networkNodeService.context)
              .services()
              .list(namespace, Templates.renderNodeSvcLabelsFromNodeId(networkNodeService.nodeId));

            grpcWebProxyEndpoint
              .setDomainName(
                Templates.renderSvcFullyQualifiedDomainName(
                  svc[0].metadata.name,
                  namespace.name,
                  cluster.dnsBaseDomain,
                ),
              )
              .setPort(grpcProxyPort);
          } else {
            grpcWebProxyEndpoint
              .setDomainName(
                Templates.renderSvcFullyQualifiedDomainName(
                  networkNodeService.envoyProxyName,
                  namespace.name,
                  cluster.dnsBaseDomain,
                ),
              )
              .setPort(grpcProxyPort);
          }

          // Publish a routable IP for the gRPC endpoint so pinger avoids the bootstrap FQDN, which hangs on Windows Kind.
          const grpcIpAddress: string =
            networkNodeService.nodeServiceLoadBalancerIp || networkNodeService.nodeServiceClusterIp;
          const grpcServiceEndpoint: ServiceEndpoint = new ServiceEndpoint({
            port: networkNodeService.nodeServiceGrpcPort,
            ipAddressV4: parseIpAddressToUint8Array(grpcIpAddress),
          });

          let updateTransaction: NodeUpdateTransaction = new NodeUpdateTransaction()
            .setNodeId(Long.fromString(networkNodeService.nodeId.toString()))
            .setGrpcWebProxyEndpoint(grpcWebProxyEndpoint)
            .setServiceEndpoints([grpcServiceEndpoint])
            .freezeWith(nodeClient);

          if (adminKey) {
            updateTransaction = await updateTransaction.sign(adminKey);
          }

          let transactionResponse: TransactionResponse;
          let updateTransactionReceipt: TransactionReceipt;
          try {
            transactionResponse = await updateTransaction.execute(nodeClient);
            updateTransactionReceipt = await transactionResponse.getReceipt(nodeClient);
          } catch (error) {
            throw new SoloErrors.component.nodeUpdateTransactionError(error);
          }

          if (updateTransactionReceipt.status !== Status.Success) {
            throw new SoloErrors.system.grpcProxyEndpointFailed();
          }
        }
      },
    };
  }

  // generates the node overrides file.  This file is used to override the address book.  It is useful in cases where
  // there is a hair pinning issue and the node needs to connect to itself via a different address.
  private async generateNodeOverridesJson(
    namespace: NamespaceName,
    nodeAliases: NodeAliases,
    stagingDirectory: string,
  ): Promise<void> {
    const deploymentName: string = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServiceMap: Map<NodeAlias, NetworkNodeServices> = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deploymentName,
    );

    const nodeOverridesModel: NodeOverridesModel = new NodeOverridesModel(nodeAliases, networkNodeServiceMap);

    const nodeOverridesYaml: string = PathEx.join(stagingDirectory, constants.NODE_OVERRIDE_FILE);
    fs.writeFileSync(nodeOverridesYaml, nodeOverridesModel.toYAML());
  }

  /**
   * Generate genesis network json file
   * @param namespace - namespace
   * @param consensusNodes - consensus nodes
   * @param keysDirectory - keys directory
   * @param stagingDirectory - staging directory
   * @param domainNamesMapping
   * @param gossipEndpointPortMapping - port overrides for the gossip endpoints
   * @param serviceEndpointPortMapping - port overrides for the gRPC service endpoints
   */
  private async generateGenesisNetworkJson(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
    stagingDirectory: string,
    domainNamesMapping?: Record<NodeAlias, string>,
    gossipEndpointPortMapping?: EndpointPortMapping,
    serviceEndpointPortMapping?: EndpointPortMapping,
  ): Promise<void> {
    const deploymentName: string = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServiceMap: Map<NodeAlias, NetworkNodeServices> = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deploymentName,
    );

    let adminPublicKeys: string[] = [];
    adminPublicKeys = this.configManager.getFlag(flags.adminPublicKeys)
      ? splitFlagInput(this.configManager.getFlag(flags.adminPublicKeys))
      : (Array.from({length: consensusNodes.length}, (): string =>
          constants.GENESIS_PUBLIC_KEY.toString(),
        ) as string[]);
    const genesisNetworkData: GenesisNetworkDataConstructor = await GenesisNetworkDataConstructor.initialize(
      consensusNodes,
      this.keyManager,
      this.accountManager,
      networkNodeServiceMap,
      adminPublicKeys,
      domainNamesMapping,
      gossipEndpointPortMapping,
      serviceEndpointPortMapping,
    );

    const genesisNetworkJson: string = PathEx.join(stagingDirectory, 'genesis-network.json');
    fs.writeFileSync(genesisNetworkJson, genesisNetworkData.toJSON());
  }

  public prepareStagingDirectory(nodeAliasesProperty: string): SoloListrTask<AnyListrContext> {
    return {
      title: 'Prepare staging directory',
      task: ({config}, task): SoloListr<AnyListrContext> => {
        const nodeAliases: NodeAliases = config[nodeAliasesProperty];
        const subTasks: SoloListrTask<AnyListrContext>[] = [
          {
            title: 'Create and populate staging directory',
            task: async ({config}): Promise<void> => {
              const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
              const applicationPropertiesPath: string = PathEx.joinWithRealPath(
                config.cacheDir,
                'templates',
                constants.APPLICATION_PROPERTIES,
              );

              const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
              const yamlRoot: AnyObject = {};

              const stagingDirectory: string = Templates.renderStagingDir(
                this.configManager.getFlag(flags.cacheDir),
                this.configManager.getFlag(flags.consensusNodeVersion),
              );

              if (!fs.existsSync(stagingDirectory)) {
                await this.profileManager.prepareStagingDirectory(
                  consensusNodes,
                  nodeAliases,
                  yamlRoot,
                  deploymentName,
                  applicationPropertiesPath,
                );
              }
            },
          },
        ];
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.DEFAULT);
      },
    };
  }

  public startNodes(nodeAliasesProperty: string): SoloListrTask<AnyListrContext> {
    return {
      title: 'Starting nodes',
      task: (context_, task): any => {
        const config: any = context_.config;
        const nodeAliases: NodeAliases = config[nodeAliasesProperty];
        const subTasks: SoloListrTask<AnyListrContext>[] = [];

        for (const nodeAlias of nodeAliases) {
          subTasks.push({
            title: `Start node: ${chalk.yellow(nodeAlias)}`,
            task: async (): Promise<void> => {
              const context: string = extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
              const labels: string[] = [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'];
              await this.k8Factory
                .getK8(context)
                .pods()
                .waitForReadyStatus(config.namespace, labels, 120, 1000, undefined, true);

              const startCommand: string = this.buildStartNetworkNodeCommand();

              const container: Container = await new K8Helper(context).getConsensusNodeRootContainer(
                config.namespace,
                nodeAlias,
              );
              if (config.localBuildPath) {
                await container.execContainer(['bash', '-c', this.buildRefreshLiveLocalBuildJarsCommand()]);
              }
              for (const directory of [constants.HEDERA_DATA_APPS_DIR, constants.HEDERA_DATA_LIB_DIR]) {
                const directoryPath: string = `${constants.HEDERA_HAPI_PATH}/${directory}`;
                const output: string = await container.execContainer([
                  'bash',
                  '-c',
                  `ls "${directoryPath}"/*.jar 2>/dev/null | wc -l`,
                ]);
                if (Number.parseInt(output.trim(), 10) === 0) {
                  throw new SoloErrors.validation.nodeJarFilesNotInContainer(nodeAlias, directoryPath);
                }
              }
              await container.execContainer(['bash', '-c', startCommand]);
            },
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  private buildRefreshLiveLocalBuildJarsCommand(): string {
    const hapiPath: string = constants.HEDERA_HAPI_PATH;
    const applicationDirectory: string = `${hapiPath}/${constants.HEDERA_DATA_APPS_DIR}`;
    const libraryDirectory: string = `${hapiPath}/${constants.HEDERA_DATA_LIB_DIR}`;
    const applicationJar: string = `${applicationDirectory}/${constants.HEDERA_APP_NAME}`;
    const upgradeDirectory: string = `${hapiPath}/data/upgrade/current`;
    const upgradeApplicationDirectory: string = `${upgradeDirectory}/${constants.HEDERA_DATA_APPS_DIR}`;
    const upgradeLibraryDirectory: string = `${upgradeDirectory}/${constants.HEDERA_DATA_LIB_DIR}`;
    const upgradeApplicationJar: string = `${upgradeApplicationDirectory}/${constants.HEDERA_APP_NAME}`;

    return [
      `if [ -f "${upgradeApplicationJar}" ]; then`,
      `  rm -f "${applicationDirectory}"/*.jar "${libraryDirectory}"/*.jar`,
      `  cp -f "${upgradeApplicationDirectory}"/*.jar "${applicationDirectory}/"`,
      `  cp -f "${upgradeLibraryDirectory}"/*.jar "${libraryDirectory}/"`,
      this.buildNormalizeHederaJarPermissionsCommand(),
      `  sync "${hapiPath}"`,
      'fi',
      `test -f "${applicationJar}" || { echo "missing ${applicationJar}" >&2; exit 1; }`,
      `/command/s6-setuidgid hedera unzip -l "${applicationJar}" "com/hedera/node/app/ServicesMain.class" | grep -q "com/hedera/node/app/ServicesMain.class" || { echo "missing ServicesMain in ${applicationJar}" >&2; exit 1; }`,
    ].join('\n');
  }

  private buildNormalizeHederaJarPermissionsCommand(hapiPath: string = constants.HEDERA_HAPI_PATH): string {
    const applicationDirectory: string = `${hapiPath}/${constants.HEDERA_DATA_APPS_DIR}`;
    const libraryDirectory: string = `${hapiPath}/${constants.HEDERA_DATA_LIB_DIR}`;

    return [
      `chown -R hedera:hedera "${applicationDirectory}" "${libraryDirectory}"`,
      `chmod -R u+rwX,g+rX,o+rX "${applicationDirectory}" "${libraryDirectory}"`,
    ].join('\n');
  }

  /**
   * Build the command used by `consensus node start` to restart the network-node service.
   * Delegate lifecycle handling entirely to solo-container so Solo stays orchestration-only.
   */
  private buildStartNetworkNodeCommand(): string {
    const lifecycleHelperPath: string = '/command/network-node-lifecycle';
    return [
      // Fail fast when the helper is missing so callers immediately know the image
      // does not satisfy Solo's lifecycle contract.
      `test -x "${lifecycleHelperPath}" || { echo "missing ${lifecycleHelperPath}; update solo-container image" >&2; exit 1; }`,
      [
        "if ps -ef | grep -q '[c]om.hedera.node.app.ServicesMain'",
        "then curl -sf http://localhost:9999/metrics | grep 'platform_PlatformStatus' | grep -q ' 2[.]0$' && true < /dev/tcp/127.0.0.1/50211",
        'else false',
        'fi',
      ].join('\n'),
      // ACTIVE nodes only need the autostart marker restored; the full helper start
      // path deliberately forces a down/up cycle for transitional or frozen nodes.
      `if [ $? -eq 0 ]; then "${lifecycleHelperPath}" enable-autostart; exit 0; fi`,
      // A JVM can remain alive with only background threads after the main platform
      // exits. Clear any non-ready process before asking the helper to start it.
      `"${lifecycleHelperPath}" stop-and-disable-autostart`,
      // The helper owns both service control and autostart marker semantics.
      `"${lifecycleHelperPath}" start-and-enable-autostart`,
    ].join('\n');
  }

  /**
   * Build the command used by `consensus node stop` to stop the network-node service.
   * Delegate lifecycle handling entirely to solo-container so Solo stays orchestration-only.
   */
  private buildStopNetworkNodeCommand(): string {
    const lifecycleHelperPath: string = '/command/network-node-lifecycle';
    return [
      `test -x "${lifecycleHelperPath}" || { echo "missing ${lifecycleHelperPath}; update solo-container image" >&2; exit 1; }`,
      // Keep Solo orchestration-only: hard-stop and escalation logic must stay in
      // solo-container's /command/network-node-lifecycle helper.
      `"${lifecycleHelperPath}" stop-and-disable-autostart`,
    ].join('\n');
  }

  // Distinct from enablePortForwarding: that task handles HAProxy/gRPC forwards only.
  // This one forwards the JDWP debug port so a debugger can connect and resume the suspended JVM.
  // It must run before checkNodesAndProxiesAreActive in the node start flow.
  public enableDebuggerPortForwarding(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for JVM debugger',
      task: async ({config}): Promise<void> => {
        const externalAddress: string = this.configManager.getFlag<string>(flags.externalAddress);
        const nodeAlias: NodeAlias = config.debugNodeAlias || config.consensusNodes[0].name;
        const context: string = extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);

        if (config.debugNodeAlias) {
          const pod: Pod = await new K8Helper(context).getConsensusNodePod(config.namespace, nodeAlias);

          this.logger.showUser('Enable port forwarding for JVM debugger');
          this.logger.debug(`Enable port forwarding for JVM debugger on pod ${pod.podReference.name}`);

          await pod.portForward(constants.JVM_DEBUG_PORT, constants.JVM_DEBUG_PORT, true, true, externalAddress);
        }
      },
      skip: ({config}): boolean => !config.debugNodeAlias,
    };
  }

  public enablePortForwarding(enablePortForwardHaProxy: boolean = false): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for debug port and/or GRPC port',
      task: async ({config}): Promise<void> => {
        const externalAddress: string = this.configManager.getFlag<string>(flags.externalAddress);
        const nodeAlias: NodeAlias = config.debugNodeAlias || config.consensusNodes[0].name;
        const context: string = extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);

        if (config.forcePortForward && enablePortForwardHaProxy) {
          const pods: Pod[] = await this.k8Factory
            .getK8(context)
            .pods()
            .list(config.namespace, ['solo.hedera.com/node-id=0', 'solo.hedera.com/type=haproxy']);

          if (pods.length === 0) {
            throw new SoloErrors.system.haproxyPodsNotFound();
          }

          for (const pod of pods) {
            const podReference: PodReference = pod.podReference;
            const nodeIdLabel: string | undefined = pod.labels?.['solo.hedera.com/node-id'];
            let nodeId: number;

            if (nodeIdLabel !== undefined && Number.isInteger(Number(nodeIdLabel))) {
              nodeId = Number(nodeIdLabel);
            } else {
              const podName: string = podReference.name.toString();
              const match: RegExpMatchArray | null = podName.match(/^haproxy-(node\d+)-/);
              if (!match) {
                this.logger.warn(`Skipping HAProxy pod with unknown node alias format: ${podName}`);
                continue;
              }
              nodeId = Templates.nodeIdFromNodeAlias(match[1] as NodeAlias);
            }

            await this.remoteConfig.configuration.components.managePortForward(
              undefined,
              podReference,
              constants.GRPC_PORT, // Pod port
              constants.GRPC_LOCAL_PORT + nodeId, // Local port offset by node id (node1=base, node2=base+1, ...)
              this.k8Factory.getK8(context),
              this.logger,
              ComponentTypes.HaProxy,
              'Consensus Node gRPC',
              config.isChartInstalled, // Reuse existing port if chart is already installed
              nodeId,
              true, // persist: auto-restart on failure using persist-port-forward.js
              externalAddress,
            );
          }
          await this.remoteConfig.persist();
        }
      },
      skip: ({config}): boolean => !config.debugNodeAlias && !config.forcePortForward,
    };
  }

  public checkAllNodesAreActive(nodeAliasesProperty: string): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check all nodes are ACTIVE',
      task: async (context_, task): Promise<SoloListr<AnyListrContext>> => {
        return this._checkNodeActivenessTask(context_, task, context_.config[nodeAliasesProperty]);
      },
    };
  }

  public checkAllNodesAreFrozen(nodeAliasesProperty: string): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check all nodes are FROZEN',
      task: (context_, task): SoloListr<AnyListrContext> => {
        return this._checkNodeActivenessTask(
          context_,
          task,
          context_.config[nodeAliasesProperty],
          NodeStatusCodes.FREEZE_COMPLETE,
        );
      },
    };
  }

  public checkNodeProxiesAreActive(): SoloListrTask<NodeStartContext | NodeRefreshContext | NodeRestartContext> {
    return {
      title: 'Check node proxies are ACTIVE',
      task: (context_, task): SoloListr<AnyListrContext> => {
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        return this._checkNodesProxiesTask(task, context_.config.nodeAliases) as SoloListr<AnyListrContext>;
      }, // NodeStartConfigClass NodeRefreshContext
      skip: async (context_): Promise<boolean> => {
        const app: string = (context_.config as NodeStartConfigClass | NodeRefreshConfigClass).app;
        return app && app !== constants.HEDERA_APP_NAME;
      },
    };
  }

  /**
   * Returns a task that checks node activeness and proxy readiness in parallel, reducing total
   * start time by running both independent checks concurrently instead of sequentially.
   */
  public checkNodesAndProxiesAreActive(
    nodeAliasesProperty: string,
  ): SoloListrTask<NodeStartContext | NodeRefreshContext | NodeRestartContext> {
    return {
      title: 'Check nodes are ACTIVE and proxies are ready',
      task: (context_, task): SoloListr<AnyListrContext> => {
        const subTasks: SoloListrTask<AnyListrContext>[] = [
          {
            title: 'Check all nodes are ACTIVE',
            task: async (context__, t): Promise<SoloListr<AnyListrContext>> =>
              this._checkNodeActivenessTask(context__, t, context__.config[nodeAliasesProperty]),
          },
          {
            title: 'Check node proxies are ACTIVE',
            task: (context__, t): SoloListr<AnyListrContext> =>
              this._checkNodesProxiesTask(t, context__.config[nodeAliasesProperty]) as SoloListr<AnyListrContext>,
            skip: (context__): boolean => {
              const app: string = (context__.config as NodeStartConfigClass | NodeRefreshConfigClass).app;
              return app && app !== constants.HEDERA_APP_NAME;
            },
          },
        ];

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  public checkAllNodeProxiesAreActive(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    return {
      title: 'Check all node proxies are ACTIVE',
      task: (context_, task): SoloListr<AnyListrContext> => {
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        return this._checkNodesProxiesTask(task, context_.config.allNodeAliases) as SoloListr<AnyListrContext>;
      },
    };
  }

  // Update account manager and transfer hbar for staking purpose
  public triggerStakeWeightCalculate<T extends {config: AnyObject}>(
    transactionType: NodeSubcommandType,
  ): SoloListrTask<T> {
    return {
      title: 'Trigger stake weight calculate',
      task: async (context_): Promise<void> => {
        const config: AnyObject = context_.config;
        this.logger.info(
          `Waiting ${constants.TRIGGER_STAKE_WEIGHT_CALCULATE_WAIT_SECONDS} seconds for the handler to be able to trigger the network node stake weight recalculate`,
        );
        await sleep(Duration.ofSeconds(constants.TRIGGER_STAKE_WEIGHT_CALCULATE_WAIT_SECONDS));
        const deploymentName: string = this.configManager.getFlag<DeploymentName>(flags.deployment);
        const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(
          config.allNodeAliases,
          deploymentName,
        );
        let skipNodeAlias: NodeAlias;

        switch (transactionType) {
          case NodeSubcommandType.ADD: {
            break;
          }
          case NodeSubcommandType.UPDATE: {
            if (config.newAccountNumber) {
              // update map with current account ids
              accountMap.set(config.nodeAlias, config.newAccountNumber);
              skipNodeAlias = config.nodeAlias;
            }
            break;
          }
          case NodeSubcommandType.DESTROY: {
            if (config.nodeAlias) {
              accountMap.delete(config.nodeAlias);
              skipNodeAlias = config.nodeAlias;
            }
          }
        }

        config.nodeClient = await this.accountManager.refreshNodeClient(
          config.namespace,
          this.remoteConfig.getClusterRefs(),
          this.configManager.getFlag<DeploymentName>(flags.deployment),
          undefined,
          {type: 'all', skipNodeAlias},
        );

        // send some write transactions to invoke the handler that will trigger the stake weight recalculate
        const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deploymentName);
        for (const nodeAlias of accountMap.keys()) {
          const accountId: string = accountMap.get(nodeAlias);
          config.nodeClient.setOperator(treasuryAccountId, config.treasuryKey);
          await this.accountManager.transferAmount(treasuryAccountId, accountId, 1);
        }
      },
    };
  }

  public addNodeStakes(): SoloListrTask<NodeStartContext> {
    return {
      title: 'Add node stakes',
      task: (context_, task): SoloListr<NodeStartContext> | void => {
        if (!context_.config.app || context_.config.app === constants.HEDERA_APP_NAME) {
          const subTasks: SoloListrTask<NodeStartContext>[] = [];

          const deploymentName: string = this.configManager.getFlag<DeploymentName>(flags.deployment);
          const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(
            context_.config.nodeAliases,
            deploymentName,
          );
          // TODO: 'ctx.config.stakeAmount' is never initialized in the config
          const stakeAmountConfig: string | undefined = (context_.config as AnyObject).stakeAmount as
            string | undefined;
          const stakeAmountParsed: string[] = stakeAmountConfig ? splitFlagInput(stakeAmountConfig) : [];
          let nodeIndex: number = 0;
          for (const nodeAlias of context_.config.nodeAliases) {
            const accountId: string = accountMap.get(nodeAlias);
            const stakeAmount: string | number =
              stakeAmountParsed.length > 0 ? stakeAmountParsed[nodeIndex] : HEDERA_NODE_DEFAULT_STAKE_AMOUNT;
            subTasks.push({
              title: `Adding stake for node: ${chalk.yellow(nodeAlias)}`,
              task: async () => await this._addStake(context_.config.namespace, accountId, nodeAlias, +stakeAmount),
            });
            nodeIndex++;
          }

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        }
      },
    };
  }

  public stakeNewNode(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Stake new node',
      task: async context_ => {
        await this.accountManager.refreshNodeClient(
          context_.config.namespace,
          this.remoteConfig.getClusterRefs(),
          this.configManager.getFlag<DeploymentName>(flags.deployment),
          this.configManager.getFlag<boolean>(flags.forcePortForward),
          {type: 'all', skipNodeAlias: context_.config.nodeAlias},
        );
        await this._addStake(context_.config.namespace, context_.newNode.accountId, context_.config.nodeAlias);
      },
    };
  }

  public emitNodeStartedEvent(): SoloListrTask<NodeStartContext> {
    return {
      title: 'Emit node started event',
      task: async (context_: NodeStartContext): Promise<void> => {
        this.eventBus.emit(new NodesStartedEvent(context_.config.deployment));
      },
    };
  }

  public stopNodes(
    nodeAliasesProperty: string,
  ): SoloListrTask<NodeStopContext | NodeFreezeContext | NodeDestroyContext | NodeUpgradeContext> {
    return {
      title: 'Stopping nodes',
      task: async (context_, task): Promise<any> => {
        const subTasks: SoloListrTask<NodeStopContext | NodeFreezeContext | NodeDestroyContext>[] = [];

        if (!(context_.config as CheckedNodesConfigClass).skipStop) {
          await this.accountManager.close();
          for (const nodeAlias of context_.config[nodeAliasesProperty]) {
            const podReference: any = (context_.config as CheckedNodesConfigClass).podRefs[nodeAlias];
            const containerReference: ContainerReference = ContainerReference.of(
              podReference,
              constants.ROOT_CONTAINER,
            );
            const context: string = extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

            subTasks.push({
              title: `Stop node: ${chalk.yellow(nodeAlias)}`,
              task: async () => {
                const container: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);

                await container.execContainer(['bash', '-c', this.buildStopNetworkNodeCommand()]);
              },
            });
          }
        }

        // setup the sub-tasks
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  public finalize(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Finalize',
      task: (): void => {
        // reset flags so that keys are not regenerated later
        this.configManager.setFlag(flags.generateGossipKeys, false);
        this.configManager.setFlag(flags.generateTlsKeys, false);
      },
    };
  }

  public dumpNetworkNodesSaveState(): SoloListrTask<NodeRefreshContext> {
    return {
      title: 'Dump network nodes saved state',
      task: (context_, task): any => {
        const config: NodeRefreshConfigClass = context_.config;
        const subTasks: SoloListrTask<NodeRefreshContext>[] = [];

        for (const nodeAlias of config.nodeAliases) {
          const podReference: PodReference = config.podRefs[nodeAlias];
          const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
          const context: string = extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

          subTasks.push({
            title: `Node: ${chalk.yellow(nodeAlias)}`,
            task: async (): Promise<string> =>
              await this.k8Factory
                .getK8(context)
                .containers()
                .readByRef(containerReference)
                .execContainer(['bash', '-c', `rm -rf ${constants.HEDERA_HAPI_PATH}/data/saved/*`]),
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

  public getNodeLogsAndConfigs(
    excludeSensitiveData?: boolean,
    outputDirectory?: string,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext> {
    return {
      title: 'Get consensus node logs and configs',
      task: async ({config: {namespace, contexts}}): Promise<void> => {
        await container
          .resolve<NetworkNodes>(InjectTokens.NetworkNodes)
          .getLogs(namespace, contexts, outputDirectory, excludeSensitiveData);
      },
    };
  }

  private isDefaultFlagValue(flag: CommandFlag): boolean {
    const value: string | boolean | number = this.configManager.getFlag(flag);
    const defaultValue: string | boolean | number = flags.allFlagsMap.get(flag.name).definition.defaultValue;
    return value === defaultValue;
  }

  /**
   * `helm upgrade` only triggers a StatefulSet rollout when the rendered pod template actually
   * changes (root container image/tag, a volume mount toggled by application.env, resources,
   * etc). Rather than guessing from which CLI flags were passed, poll briefly for evidence the
   * node's pod is actually being recreated, so a chart-version/image bump is waited on even
   * without --application-env, and an unrelated values change that never touches the pod
   * template doesn't block on a restart that will never happen.
   */
  private static async didNodePodRolloutStart(
    podsApi: Pods,
    namespace: NamespaceName,
    labels: string[],
    previousPod: Pod | undefined,
  ): Promise<boolean> {
    for (let attempt: number = 1; attempt <= constants.NODE_POD_ROLLOUT_DETECTION_MAX_ATTEMPTS; attempt++) {
      const [currentPod]: Pod[] = await podsApi.list(namespace, labels);

      if (!previousPod || !currentPod) {
        return true;
      }

      const recreated: boolean =
        Boolean(currentPod.deletionTimestamp) ||
        currentPod.creationTimestamp?.getTime() !== previousPod.creationTimestamp?.getTime() ||
        currentPod.containerImage !== previousPod.containerImage;

      if (recreated) {
        return true;
      }

      await sleep(Duration.ofMillis(constants.NODE_POD_ROLLOUT_DETECTION_DELAY));
    }

    return false;
  }

  public upgradeNodeConfigurationFilesWithChart(): SoloListrTask<NodeUpgradeContext> {
    return {
      title: 'Update node configuration files',
      task: async ({config}, task): Promise<Listr<NodeConnectionsContext, any, any> | void> => {
        // This task also owns the only `helm upgrade` call in the `node upgrade` flow, so it must
        // still run when the user is only bumping the chart version, chart directory, or supplying
        // a custom values file -- none of which are node config file flags -- even though no
        // config file needs to be copied in that case.
        const chartUpgradeTriggerFlags: CommandFlag[] = [
          flags.soloChartVersion,
          flags.chartDirectory,
          flags.networkDeploymentValuesFile,
        ];

        if (
          ![...flags.nodeConfigFileFlags.values(), ...chartUpgradeTriggerFlags].some(
            (flag): boolean => !this.isDefaultFlagValue(flag),
          )
        ) {
          task.skip(
            `${task.title} ${chalk.yellow('[SKIPPING]')} ` +
              chalk.grey('no consensus node configuration files or chart changes to apply'),
          );

          return;
        }

        const stagingDirectory: string = Templates.renderStagingDir(
          this.configManager.getFlag(flags.cacheDir),
          this.configManager.getFlag(flags.consensusNodeVersion),
        );

        for (const flag of flags.nodeConfigFileFlags.values()) {
          if (this.isDefaultFlagValue(flag)) {
            continue;
          }

          const sourceFilePath: string = this.configManager.getFlagFile(flag);
          const currentWorkingDirectory: string = process.env.INIT_CWD || process.cwd();
          const sourceAbsoluteFilePath: string = PathEx.resolve(currentWorkingDirectory, sourceFilePath);
          if (!fs.existsSync(sourceAbsoluteFilePath)) {
            throw new SoloErrors.validation.configFileNotFound(flag.name, sourceAbsoluteFilePath, sourceFilePath);
          }

          const destinationFileName: string = PathEx.basename(flag.definition.defaultValue as string);
          const destinationPath: string = PathEx.join(stagingDirectory, 'templates', destinationFileName);
          this.logger.debug(`Copying configuration file to staging: ${sourceAbsoluteFilePath} -> ${destinationPath}`);

          fs.cpSync(sourceAbsoluteFilePath, destinationPath, {force: true});
        }

        const yamlRoot: AnyObject = {};

        if (!this.isDefaultFlagValue(flags.log4j2Xml)) {
          await this.profileManager.resourcesForNetworkUpgrade(
            'hedera.configMaps.log4j2Xml',
            'log4j2.xml',
            stagingDirectory,
            yamlRoot,
          );
        }

        if (!this.isDefaultFlagValue(flags.settingTxt)) {
          await this.profileManager.resourcesForNetworkUpgrade(
            'hedera.configMaps.settingsTxt',
            'settings.txt',
            stagingDirectory,
            yamlRoot,
          );
        }

        if (!this.isDefaultFlagValue(flags.applicationProperties)) {
          await this.profileManager.resourcesForNetworkUpgrade(
            'hedera.configMaps.applicationProperties',
            constants.APPLICATION_PROPERTIES,
            stagingDirectory,
            yamlRoot,
            config.deployment,
          );
        }

        if (!this.isDefaultFlagValue(flags.apiPermissionProperties)) {
          await this.profileManager.resourcesForNetworkUpgrade(
            'hedera.configMaps.apiPermissionsProperties',
            'api-permission.properties',
            stagingDirectory,
            yamlRoot,
          );
        }

        if (!this.isDefaultFlagValue(flags.bootstrapProperties)) {
          await this.profileManager.resourcesForNetworkUpgrade(
            'hedera.configMaps.bootstrapProperties',
            'bootstrap.properties',
            stagingDirectory,
            yamlRoot,
          );
        }

        if (!this.isDefaultFlagValue(flags.applicationEnv)) {
          await this.profileManager.resourcesForNetworkUpgrade(
            'hedera.configMaps.applicationEnv',
            'application.env',
            stagingDirectory,
            yamlRoot,
          );
        }

        this.profileManager.addBlockNodesJsonValues(
          config.consensusNodes,
          config.nodeAliases,
          config.deployment,
          yamlRoot,
        );

        for (const node of config.consensusNodes) {
          const container: Container = await new K8Helper(node.context).getConsensusNodeRootContainer(
            NamespaceName.of(node.namespace),
            node.name,
          );

          if (!this.isDefaultFlagValue(flags.log4j2Xml)) {
            const sourcePath: string = PathEx.join(stagingDirectory, 'templates', 'log4j2.xml');
            const destinationPath: string = ConsensusNodePathTemplates.HEDERA_HAPI_PATH;

            await container.copyTo(sourcePath, destinationPath);
            await container.execContainer([
              'bash',
              '-c',
              `chown hedera:hedera ${destinationPath}/log4j2.xml 2>/dev/null || true`,
            ]);
          }

          if (!this.isDefaultFlagValue(flags.settingTxt)) {
            const sourcePath: string = PathEx.join(stagingDirectory, 'templates', 'settings.txt');
            const destinationPath: string = ConsensusNodePathTemplates.HEDERA_HAPI_PATH;

            await container.copyTo(sourcePath, destinationPath);
            await container.execContainer([
              'bash',
              '-c',
              `chown hedera:hedera ${destinationPath}/settings.txt 2>/dev/null || true`,
            ]);
          }

          if (!this.isDefaultFlagValue(flags.applicationProperties)) {
            const sourcePath: string = PathEx.join(stagingDirectory, 'templates', constants.APPLICATION_PROPERTIES);
            const destinationPath: string = ConsensusNodePathTemplates.DATA_CONFIG;

            await container.copyTo(sourcePath, destinationPath);
            await container.execContainer([
              'bash',
              '-c',
              `chown hedera:hedera ${destinationPath}/${constants.APPLICATION_PROPERTIES} 2>/dev/null || true`,
            ]);
          }
        }

        const profileValuesFile: Record<ClusterReferenceName, string> = {};

        const clusterReferences: ClusterReferenceName[] = [];

        for (const [clusterReference] of this.remoteConfig.getClusterRefs()) {
          clusterReferences.push(clusterReference);

          const cachedValuesFile: string = PathEx.join(config.cacheDir, `solo-${clusterReference}.yaml`);

          profileValuesFile[clusterReference] = await this.profileManager.writeToYaml(cachedValuesFile, yamlRoot);
        }

        const valuesFiles: Record<ClusterReferenceName, HelmChartValues> = this.prepareHelmChartValuesFilesMap(
          this.remoteConfig.getClusterRefs(),
          config.chartDirectory,
          profileValuesFile,
          config.valuesFile,
        ).chartValuesMap;

        // Snapshot each node's current pod before the helm upgrade runs, so that afterward we can
        // detect whether the upgrade actually triggered a StatefulSet rollout (see
        // didNodePodRolloutStart) rather than assuming it did or didn't based on which config
        // file flags were passed.
        const previousPods: Map<NodeAlias, Pod | undefined> = new Map();
        await Promise.all(
          config.consensusNodes.map(async (node): Promise<void> => {
            const labels: string[] = [`solo.hedera.com/node-name=${node.name}`, 'solo.hedera.com/type=network-node'];
            const [previousPod]: Pod[] = await this.k8Factory
              .getK8(node.context)
              .pods()
              .list(NamespaceName.of(node.namespace), labels);
            previousPods.set(node.name, previousPod);
          }),
        );
        const upgradeTimestamp: Date = new Date();

        const subTasks: SoloListrTask<NodeConnectionsContext>[] = [
          {
            title: 'Update all charts',
            task: async (): Promise<void> => {
              await Promise.all(
                clusterReferences.map(async (clusterReference: string): Promise<void> => {
                  const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference).toString();

                  config.soloChartVersion = SemanticVersion.getValidSemanticVersion(
                    config.soloChartVersion,
                    false,
                    'Solo chart version',
                    MINIMUM_SOLO_CHART_VERSION,
                  );

                  await this.chartManager.upgrade(
                    config.namespace,
                    constants.SOLO_DEPLOYMENT_CHART,
                    constants.SOLO_DEPLOYMENT_CHART,
                    config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
                    config.soloChartVersion,
                    valuesFiles[clusterReference],
                    context,
                    true,
                  );

                  showVersionBanner(this.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion, 'Upgraded');
                }),
              );
            },
          },
          {
            title: 'Re-apply configuration files to nodes after chart update',
            task: async (): Promise<void> => {
              // The helm upgrade only triggers a StatefulSet rolling update, which restarts the pod
              // and runs the init-copier init container, when it actually changed the rendered pod
              // template (root container image/tag, application.env's volume mount, etc). That
              // init container copies the ConfigMap (which may have stale values) to the PVC,
              // overwriting what was copied above. So: wait for a real rollout only when one was
              // actually observed, then re-copy the staging application.properties so that CN reads
              // the correct values on startup.
              for (const node of config.consensusNodes) {
                const labels: string[] = [
                  `solo.hedera.com/node-name=${node.name}`,
                  'solo.hedera.com/type=network-node',
                ];
                const namespace: NamespaceName = NamespaceName.of(node.namespace);
                const podsApi: Pods = this.k8Factory.getK8(node.context).pods();

                const rolloutStarted: boolean = await NodeCommandTasks.didNodePodRolloutStart(
                  podsApi,
                  namespace,
                  labels,
                  previousPods.get(node.name),
                );

                if (!rolloutStarted) {
                  continue;
                }

                await podsApi.waitForReadyStatus(namespace, labels, 120, 1000, upgradeTimestamp, true);

                if (!this.isDefaultFlagValue(flags.applicationProperties)) {
                  const container: Container = await new K8Helper(node.context).getConsensusNodeRootContainer(
                    namespace,
                    node.name,
                  );

                  const sourcePath: string = PathEx.join(
                    stagingDirectory,
                    'templates',
                    constants.APPLICATION_PROPERTIES,
                  );
                  const destinationPath: string = ConsensusNodePathTemplates.DATA_CONFIG;

                  await container.copyTo(sourcePath, destinationPath);
                  await container.execContainer([
                    'bash',
                    '-c',
                    `chown hedera:hedera ${destinationPath}/${constants.APPLICATION_PROPERTIES} 2>/dev/null || true`,
                  ]);
                }
              }
            },
          },
        ];

        return task.newListr(subTasks, {concurrent: false, rendererOptions: {collapseSubtasks: false}});
      },
    };
  }

  public getHelmChartValues(
    outputDirectory?: string,
    scopeToSelectedDeployment: boolean = false,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: scopeToSelectedDeployment
        ? 'Get Helm chart values from selected deployment releases'
        : 'Get Helm chart values from all releases',
      task: async (context_: AnyListrContext): Promise<void> => {
        const contexts: Contexts = this.k8Factory.default().contexts();
        const helmClient: HelmClient = new DefaultHelmClient();
        container.registerInstance(InjectTokens.Helm, helmClient);
        const helmChartValuesDirectory: string = outputDirectory
          ? PathEx.join(outputDirectory, 'helm-chart-values')
          : PathEx.join(constants.SOLO_LOGS_DIR, 'helm-chart-values');

        try {
          if (!fs.existsSync(helmChartValuesDirectory)) {
            fs.mkdirSync(helmChartValuesDirectory, {recursive: true});
          }
        } catch (error) {
          this.logger.warn(`Failed to create output directory ${helmChartValuesDirectory}: ${error}`);
          return;
        }

        this.logger.info(`Helm chart values will be saved to: ${helmChartValuesDirectory}`);

        const scopedContextList: string[] | undefined = scopeToSelectedDeployment
          ? context_?.config?.contexts
          : undefined;
        const scopedContextNames: ReadonlySet<string> | undefined =
          scopedContextList === undefined ? undefined : new Set<string>(scopedContextList);
        const scopedNamespaceName: string | undefined = scopeToSelectedDeployment
          ? context_?.config?.namespace?.name
          : undefined;
        const contextList: string[] =
          scopedContextNames === undefined
            ? contexts.list()
            : contexts.list().filter((context): boolean => scopedContextNames.has(context));
        this.logger.info(`Processing Helm releases for contexts: ${contextList.join(', ')}`);

        for (const context of contextList) {
          this.logger.info(`Getting Helm releases for context: ${context}`);

          try {
            const releases: ReleaseItem[] = await helmClient.listReleases(true, undefined, context);

            if (releases.length === 0) {
              this.logger.info(`No Helm releases found in context: ${context}`);
              continue;
            }

            this.logger.info(`Found ${releases.length} Helm release(s) in context ${context}`);

            // Create directory for this context
            const contextDirectory: string = PathEx.join(helmChartValuesDirectory, context);
            try {
              if (!fs.existsSync(contextDirectory)) {
                fs.mkdirSync(contextDirectory, {recursive: true});
              }
            } catch (error) {
              this.logger.warn(`Failed to create context directory ${contextDirectory}: ${error}`);
              continue;
            }

            for (const release of releases) {
              if (scopedNamespaceName !== undefined && release.namespace !== scopedNamespaceName) {
                continue;
              }
              try {
                this.logger.info(`Getting values for release: ${release.name} in namespace: ${release.namespace}`);

                // Use "helm get values --all" (user-supplied + chart defaults only).
                // Do NOT use "helm get all": it also outputs the full rendered K8s manifests
                // which include Secret resources (base64-encoded credentials, TLS keys, etc.)
                // and pod specs that may embed plaintext passwords from chart values.
                // Use an explicit argument array with no shell so release/namespace/context cannot
                // be interpreted by a shell (shell injection). helm is resolved via the prepended PATH.
                const output: string = execFileSync(
                  'helm',
                  ['get', 'values', release.name, '-n', release.namespace, '--kube-context', context, '--all'],
                  {
                    shell: false,
                    encoding: 'utf8',
                    cwd: process.cwd(),
                    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
                    env: SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM, {
                      PATH: `${container.resolve(InjectTokens.HelmInstallationDirectory)}${PathEx.delimiter}${SubprocessEnvironment.currentPath()}`,
                    }),
                  },
                ).toString();

                const valuesFile: string = PathEx.join(contextDirectory, `${release.name}.yaml`);
                try {
                  fs.writeFileSync(valuesFile, output);
                  this.logger.info(`Saved Helm values for ${release.name} to ${valuesFile}`);
                } catch (error) {
                  this.logger.warn(`Failed to write values file for ${release.name}: ${error}`);
                  // Continue with other releases even if one fails
                }
              } catch (error) {
                this.logger.warn(`Failed to get values for release ${release.name}: ${error}`);
                // Continue with other releases even if one fails
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to list Helm releases in context ${context}: ${error}`);
            // Continue with other contexts even if one fails
          }
        }

        this.logger.showUser(`Helm chart values saved to ${helmChartValuesDirectory}`);
      },
    };
  }

  private async checkLocalPort(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve: (value: PromiseLike<boolean> | boolean) => void): void => {
      const socket: net.Socket = new net.Socket();

      socket.setTimeout(2000);

      socket.on('timeout', (): void => resolve(false));
      socket.on('error', (): void => resolve(false));

      socket.on('connect', (): void => {
        socket.destroy();
        resolve(true);
      });

      socket.connect(port, 'localhost');
    });
  }

  private async getComponentData(
    schema: BaseStateSchema,
    componentDisplayName: ComponentDisplayName,
    haProxyState?: HaProxyStateSchema,
  ): Promise<ComponentData> {
    const metadata: ComponentStateMetadataSchema = haProxyState ? haProxyState.metadata : schema.metadata;

    const clusterSchema: Readonly<ClusterSchema> = this.remoteConfig.configuration.clusters.find(
      (cluster: Readonly<ClusterSchema>): boolean => cluster.name === metadata.cluster,
    );

    const namespace: NamespaceName = NamespaceName.of(metadata.namespace);
    const clusterReference: ClusterReferenceName = clusterSchema.name;
    const contextName: Context = this.localConfig.configuration.clusterRefs.get(clusterSchema.name)?.toString();
    const componentId: ComponentId = metadata.id;

    return {
      clusterReference,
      contextName,
      componentId,
      namespace,
      componentDisplayName,
      portForwards: metadata.portForwardConfigs,
    };
  }

  private extractDataFromGroup(
    states: BaseStateSchema[],
    componentDisplayName: ComponentDisplayName,
    haProxyStates: HaProxyStateSchema[] = [],
  ): Promise<ComponentData>[] {
    return states.map((state: BaseStateSchema): Promise<ComponentData> =>
      this.getComponentData(
        state,
        componentDisplayName,
        haProxyStates.find(
          (haProxyState: HaProxyStateSchema): boolean => haProxyState.metadata.id === state.metadata.id,
        ),
      ),
    );
  }

  private validateComponentData(
    {portForwards, namespace, clusterReference, contextName, componentId, componentDisplayName}: ComponentData,
    check: boolean = false,
  ): SoloListrTask<NodeConnectionsContext> {
    return {
      title: cyan(componentDisplayName),
      task: (_, task): SoloListr<NodeConnectionsContext> | void => {
        portForwards = portForwards || [];

        if (portForwards.length === 0) {
          task.title += ` - ${yellow('No port forward configs')}`;
        }

        task.title += `\n${gray('Id:')} ${yellow(componentId)}`;
        task.title += `\n${gray('Namespace:')} ${yellow(namespace)}`;
        task.title += `\n${gray('Context:')} ${yellow(contextName)}`;
        task.title += `\n${gray('Cluster Reference:')} ${yellow(clusterReference)}`;

        if (portForwards.length === 0) {
          return;
        }

        const subTasks: SoloListrTask<NodeConnectionsContext>[] = [];

        for (const {localPort, podPort} of portForwards) {
          subTasks.push({
            title: 'Port forward config: ',
            task: async (_, task): Promise<void> => {
              task.title += '\n\t' + gray('Local port') + ' ' + yellow(`[${localPort}]`) + ' - ';

              const isReachable: boolean = await this.checkLocalPort(localPort);
              task.title += isReachable ? green('Successfully pinged') : red('Failed to ping');

              task.title += '\n\t' + gray('Pod port') + ' ' + yellow(`[${podPort}]`);

              if (check && !isReachable) {
                throw new SoloErrors.system.portForwardMissing(componentDisplayName, componentId, localPort, podPort);
              }
            },
          });
        }

        return task.newListr(subTasks, {concurrent: true, rendererOptions: {collapseSubtasks: false}});
      },
    };
  }

  public testAccountCreation(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Test create account',
      task: async ({config}, task): Promise<void> => {
        const {namespace, deployment, context} = config;

        await this.accountManager.loadNodeClient(namespace, this.remoteConfig.getClusterRefs(), deployment);

        try {
          const privateKey: PrivateKey = PrivateKey.generateECDSA();

          config.newAccount = await this.accountManager.createNewAccount(namespace, privateKey, 0, true, context);

          task.title += ` - ${green('Success')}`;
        } catch (error) {
          this.logger.showUser(error);
          task.title += ` - ${red('Fail')}`;
        }
      },
    };
  }

  public prepareDiagnosticsData(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Prepare diagnostics data',
      task: async ({config}): Promise<void> => {
        const state: DeploymentStateSchema = this.remoteConfig.configuration.components.state;

        config.componentsData = await Promise.all([
          ...this.extractDataFromGroup(state.mirrorNodes, 'Mirror node'),
          ...this.extractDataFromGroup(state.relayNodes, 'Relay node'),
          ...this.extractDataFromGroup(state.consensusNodes, 'Consensus node', state.haProxies),
          ...this.extractDataFromGroup(state.explorers, 'Explorer node'),
          ...this.extractDataFromGroup(state.blockNodes, 'Block node'),
        ]);
      },
    };
  }

  public validateLocalPorts(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Test local ports',
      task: async ({config: {check, componentsData}}, task): Promise<SoloListr<NodeConnectionsContext>> => {
        const subTasks: SoloListrTask<NodeConnectionsContext>[] = [];

        for (const componentData of componentsData) {
          subTasks.push(this.validateComponentData(componentData, check));
        }

        return task.newListr(subTasks, {concurrent: true, rendererOptions: {collapseSubtasks: false}});
      },
    };
  }

  public testRelay(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Test relay',
      task: async ({config: {componentsData, newAccount}}, task): Promise<void> => {
        const relayData: ComponentData = componentsData.find(
          (data): boolean => data.componentDisplayName === 'Relay node',
        );

        if (!relayData) {
          task.title += gray(' - No relay data') + ' ' + yellow('[SKIPPING]');
          return;
        }

        if (!relayData.portForwards || relayData.portForwards.length === 0) {
          task.title += gray(' - No relay port-forwards') + ' ' + yellow('[SKIPPING]');
          return;
        }

        task.title += gray(' - Testing relay');

        const url: string = `http://localhost:${relayData.portForwards[0].localPort}`;

        const rpc: (method: string, parameters?: any[]) => Promise<any> = async (
          method: string,
          parameters: any[] = [],
        ): Promise<any> => {
          const response: Response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              jsonrpc: '2.0',
              method,
              params: parameters,
              id: 1,
            }),
          });
          if (!response.ok) {
            throw new Error(await response.text());
          }

          const data: any = await response.json();

          if (data.error) {
            throw new Error(JSON.stringify(data.error));
          }

          return data.result;
        };

        try {
          let textData: string = '\n';

          // Get Client Version
          const version: string = await rpc('web3_clientVersion');
          textData += gray('Relay responded with version: ') + yellow(version) + '\n';

          // Get chain ID
          const chainId: string = await rpc('eth_chainId');
          textData += gray('Relay chainId: ') + yellow(chainId) + '\n';

          // Get block number
          const blockNumberHex: string = await rpc('eth_blockNumber');
          const blockNumber: number = Number.parseInt(blockNumberHex, 16);
          textData += gray('Latest block number: ') + yellow(blockNumber) + '\n';

          // Get Account balance
          const accountEvmAddress: string = `0x${newAccount.accountAlias.split('.', 3)[2]}`;
          const balanceHex: string = await rpc('eth_getBalance', [accountEvmAddress, 'latest']);
          const balance: number = Number.parseInt(balanceHex, 16);
          textData += gray('Account balance: ') + yellow(`${balance} wei`) + '\n';

          task.title += ' ' + green('[SUCCESS]') + textData;
        } catch (error) {
          this.logger.showUser('Relay test failed: ' + (error instanceof Error ? error.message : error));
          task.title += ' ' + red('[FAILED]');
        }
      },
    };
  }

  public fetchAccountFromExplorer(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Test account is created',
      task: async ({config: {componentsData, newAccount}}, task): Promise<void> => {
        const explorerData: ComponentData = componentsData.find(
          (data): boolean => data.componentDisplayName === 'Explorer node',
        );

        if (!explorerData) {
          task.title += gray(' - No explorer data') + ' ' + yellow('[SKIPPING]');
          return;
        }

        if (!explorerData.portForwards || explorerData.portForwards.length === 0) {
          task.title += gray(' - No explorer port-forwards') + ' ' + yellow('[SKIPPING]');
          return;
        }

        if (!newAccount?.accountId) {
          task.title += gray(' - No new account data') + ' ' + yellow('[SKIPPING]');
          return;
        }

        const accountId: string = newAccount.accountId;

        task.title += gray(' - Attempting to fetch from explorer') + ' ' + cyan(`[${accountId}]`);

        const localPort: number = explorerData.portForwards[0].localPort;

        const response: Response = await fetch(`http://localhost:${localPort}/api/v1/accounts/${accountId}`);

        if (!response.ok) {
          const text: string = await response.text();
          this.logger.showUser('Explorer fetch error: ' + text);
          return;
        }

        task.title += ' ' + green('[SUCCESS]');
      },
    };
  }

  public getNodeStateFiles(): SoloListrTask<NodeStatesContext> {
    return {
      title: 'Get node states',
      task: async (context_): Promise<void> => {
        for (const nodeAlias of context_.config.nodeAliases) {
          const context: string = extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);
          await container
            .resolve<NetworkNodes>(InjectTokens.NetworkNodes)
            .getStatesFromPod(context_.config.namespace, nodeAlias, context);
        }
      },
    };
  }

  public checkPVCsEnabled(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check that PVCs are enabled',
      task: async (context_): Promise<void> => {
        if (!this.configManager.getFlag(flags.persistentVolumeClaims)) {
          throw new SoloErrors.validation.pvcFlagNotEnabled();
        }

        // Create an array of promises
        const promises: any = context_.config.contexts.map(async (context): Promise<string[]> => {
          // Fetch all PVCs inside the namespace using the context
          const pvcs: string[] = await this.k8Factory
            .getK8(context)
            .pvcs()
            .list(context_.config.namespace, ['solo.hedera.com/type=node-pvc']);

          this.logger.info(`Found ${pvcs.length} PVCs in namespace ${context_.config.namespace}: ${pvcs.join(', ')}`);
          if (pvcs.length === 0) {
            throw new SoloErrors.system.noPvcFound(String(context_.config.namespace));
          }
          return pvcs;
        });

        // Wait for all promises to resolve
        await Promise.all(promises);
      },
    };
  }

  public determineNewNodeAccountNumber(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Determine new node account number',
      task: (context_): void => {
        const config: NodeAddConfigClass = context_.config;
        const values: {hedera: {nodes: any[]}} = {hedera: {nodes: []}};
        let maxNumber: Long = Long.fromNumber(0);

        let lastNodeAlias: NodeAlias = DEFAULT_NETWORK_NODE_NAME;

        for (const networkNodeServices of config.serviceMap.values()) {
          values.hedera.nodes.push({
            accountId: networkNodeServices.accountId,
            name: networkNodeServices.nodeAlias,
            nodeId: networkNodeServices.nodeId,
          });
          maxNumber = Long.fromNumber(
            Math.max(maxNumber.toNumber(), AccountId.fromString(networkNodeServices.accountId).num.toNumber()),
          );
          lastNodeAlias = networkNodeServices.nodeAlias;
        }

        const lastNodeIdMatch: RegExpMatchArray = lastNodeAlias.match(/\d+$/);
        if (lastNodeIdMatch.length > 0) {
          const incremented: number = Number.parseInt(lastNodeIdMatch[0]) + 1;
          lastNodeAlias = lastNodeAlias.replace(/\d+$/, incremented.toString()) as NodeAlias;
        }

        const deploymentName: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
        context_.maxNum = maxNumber.add(1);
        context_.newNode = {
          accountId: this.accountManager.getAccountIdByNumber(deploymentName, context_.maxNum).toString(),
          name: lastNodeAlias,
        };
        config.nodeAlias = lastNodeAlias as NodeAlias;
        config.allNodeAliases.push(lastNodeAlias as NodeAlias);
        config.newNodeAliases = [lastNodeAlias as NodeAlias];
      },
    };
  }

  public generateGossipKeys(): SoloListrTask<NodeKeysContext> {
    return this._generateGossipKeys(true) as SoloListrTask<NodeKeysContext>;
  }

  public generateGossipKey(): SoloListrTask<NodeAddContext> {
    return this._generateGossipKeys(false) as SoloListrTask<NodeAddContext>;
  }

  private async createGeneratedGossipLoadBalancerService(
    config: NodeAddConfigClass,
    k8: K8,
    nodeId: NodeId,
    accountId: string,
  ): Promise<void> {
    let serviceList: Service[] = await k8
      .services()
      .list(config.namespace, Templates.renderNodeSvcLabelsFromNodeId(nodeId));

    if (!serviceList || serviceList.length === 0) {
      serviceList = await k8
        .services()
        .list(config.namespace, [
          `solo.hedera.com/node-name=${config.nodeAlias},solo.hedera.com/type=network-node-svc`,
        ]);
    }

    if (serviceList && serviceList.length > 0) {
      return;
    }

    const manifest: AnyObject = NodeCommandTasks.buildNetworkNodeServiceManifest(
      config.namespace,
      config.nodeAlias,
      nodeId,
      accountId,
    );
    const baseDirectory: string = config.stagingDir || config.cacheDir || constants.SOLO_CACHE_DIR;
    fs.mkdirSync(baseDirectory, {recursive: true});
    const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(baseDirectory, 'generated-gossip-service-'));
    const manifestPath: string = PathEx.join(
      temporaryDirectory,
      `${Templates.renderNetworkSvcName(config.nodeAlias)}.json`,
    );

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2));
      await k8.manifests().applyManifest(manifestPath);
    } finally {
      fs.rmSync(temporaryDirectory, {force: true, recursive: true});
    }
  }

  private async getGeneratedGossipExternalAddress(
    consensusNode: ConsensusNode,
    k8: K8,
    gossipFqdnRestricted: boolean,
    loadBalancerRequired: boolean,
  ): Promise<Address> {
    if (!loadBalancerRequired) {
      return await Address.getExternalAddress(
        consensusNode,
        k8,
        +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
        gossipFqdnRestricted,
      );
    }

    for (let attempt: number = 1; attempt <= NodeCommandTasks.GENERATED_GOSSIP_LOAD_BALANCER_MAX_ATTEMPTS; attempt++) {
      const loadBalancerAddress: Address | undefined = await Address.getLoadBalancerAddress(
        consensusNode,
        k8,
        +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
      );

      if (loadBalancerAddress) {
        return loadBalancerAddress;
      }

      await sleep(NodeCommandTasks.GENERATED_GOSSIP_LOAD_BALANCER_RETRY_DELAY);
    }

    throw new SoloErrors.system.loadBalancerNotFound();
  }

  public generateGrpcTlsKeys(): SoloListrTask<NodeKeysContext> {
    return this._generateGrpcTlsKeys(true) as SoloListrTask<NodeKeysContext>;
  }

  public generateGrpcTlsKey(): SoloListrTask<NodeAddContext> {
    return this._generateGrpcTlsKeys(false) as SoloListrTask<NodeAddContext>;
  }

  public loadSigningKeyCertificate(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Load signing key certificate',
      task: (context_): void => {
        const config: any = context_.config;
        const signingCertFile: string = Templates.renderGossipPemPublicKeyFile(config.nodeAlias);
        const signingCertFullPath: string = PathEx.joinWithRealPath(config.keysDir, signingCertFile);
        context_.signingCertDer = this.keyManager.getDerFromPemCertificate(signingCertFullPath);
      },
    };
  }

  public computeMTLSCertificateHash(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Compute mTLS certificate hash',
      task: (context_): void => {
        const config: any = context_.config;
        const tlsCertFile: string = Templates.renderTLSPemPublicKeyFile(config.nodeAlias);
        const tlsCertFullPath: string = PathEx.joinWithRealPath(config.keysDir, tlsCertFile);
        const tlsCertDer: Uint8Array<ArrayBuffer> = this.keyManager.getDerFromPemCertificate(tlsCertFullPath);
        context_.tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest();
      },
    };
  }

  public prepareGossipEndpoints(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Prepare gossip endpoints',
      task: async (context_): Promise<void> => {
        const config: NodeAddConfigClass = context_.config;

        if (config.gossipEndpoints) {
          context_.gossipEndpoints = prepareEndpoints(
            config.endpointType,
            splitFlagInput(config.gossipEndpoints),
            constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT,
          );
          return;
        }

        const context: string = extractContextFromConsensusNodes(
          config.consensusNodes[0].name,
          context_.config.consensusNodes,
        );

        const k8: K8 = this.k8Factory.getK8(context);
        const gossipFqdnRestricted: boolean = await this.getGossipFqdnRestricted(config, k8);
        const shouldAvoidGossipFqdn: boolean = NodeCommandTasks.shouldAvoidGossipFqdn(
          config.consensusNodes,
          gossipFqdnRestricted,
        );
        const loadBalancerRequired: boolean = Helpers.hasMultipleKubernetesContexts(config.consensusNodes);
        const nodeId: NodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);

        if (loadBalancerRequired) {
          await this.createGeneratedGossipLoadBalancerService(config, k8, nodeId, context_.newNode.accountId);
        }

        const newConsensusNode: ConsensusNode = new ConsensusNode(
          config.nodeAlias,
          nodeId,
          config.namespace.name,
          undefined,
          context,
          config.consensusNodes[0].dnsBaseDomain,
          config.consensusNodes[0].dnsConsensusNodePattern,
          Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias),
          [],
          [],
        );

        const externalEndpointAddress: Address = await this.getGeneratedGossipExternalAddress(
          newConsensusNode,
          k8,
          shouldAvoidGossipFqdn,
          loadBalancerRequired,
        );

        context_.gossipEndpoints = [
          NodeCommandTasks.serviceEndpointFromAddress(
            new Address(+constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT, constants.LOCAL_HOST),
          ),
          NodeCommandTasks.serviceEndpointFromAddress(externalEndpointAddress),
        ];
      },
    };
  }

  private async getGossipFqdnRestricted(config: NodeAddConfigClass | NodeUpdateConfigClass, k8: K8): Promise<boolean> {
    return await resolveGossipFqdnRestricted({
      k8,
      namespace: config.namespace,
      stagingDir: config.stagingDir,
      cacheDir: constants.SOLO_CACHE_DIR,
      resourcesDir: constants.RESOURCES_DIR,
    });
  }

  public refreshNodeList(): SoloListrTask<NodeDestroyContext> {
    return {
      title: 'Refresh node alias list',
      task: (context_): void => {
        context_.config.allNodeAliases = context_.config.existingNodeAliases.filter(
          (nodeAlias: NodeAlias): boolean => nodeAlias !== context_.config.nodeAlias,
        );

        context_.config.refreshedConsensusNodes = context_.config.consensusNodes.filter(
          (consensusNode: ConsensusNode): boolean => consensusNode.name !== context_.config.nodeAlias,
        );
      },
    };
  }

  public prepareGrpcServiceEndpoints(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Prepare grpc service endpoints',
      task: (context_): void => {
        const config: NodeAddConfigClass = context_.config;
        let endpoints: string[] = [];
        // without an override the gRPC service endpoint keeps using the external gossip port, as it always has
        const servicePort: number = Templates.resolveEndpointPort(
          config.serviceEndpointPortMapping,
          config.nodeAlias,
          +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
        );

        if (config.grpcEndpoints) {
          endpoints = splitFlagInput(config.grpcEndpoints);
        } else {
          if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
            throw new SoloErrors.validation.grpcEndpointsRequired(constants.ENDPOINT_TYPE_IP);
          }

          endpoints = [
            `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${servicePort}`,
          ];
        }

        context_.grpcServiceEndpoints = prepareEndpoints(config.endpointType, endpoints, servicePort);
      },
    };
  }

  private async prepareNodeUpdateGossipEndpoints(config: NodeUpdateConfigClass): Promise<ServiceEndpoint[]> {
    if (config.gossipEndpoints) {
      return prepareEndpoints(
        config.endpointType,
        splitFlagInput(config.gossipEndpoints),
        constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT,
      );
    }

    const consensusNode: ConsensusNode | undefined = config.consensusNodes.find(
      (node: ConsensusNode): boolean => node.name === config.nodeAlias,
    );

    if (!consensusNode) {
      throw new SoloErrors.system.consensusNodeNotInConfig(config.nodeAlias);
    }

    const context: string = extractContextFromConsensusNodes(config.nodeAlias, config.consensusNodes);
    const k8: K8 = this.k8Factory.getK8(context);
    const gossipFqdnRestricted: boolean = await this.getGossipFqdnRestricted(config, k8);
    const shouldAvoidGossipFqdn: boolean = NodeCommandTasks.shouldAvoidGossipFqdn(
      config.consensusNodes,
      gossipFqdnRestricted,
    );
    const externalEndpointAddress: Address = await Address.getExternalAddress(
      consensusNode,
      k8,
      +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
      shouldAvoidGossipFqdn,
    );

    return [NodeCommandTasks.serviceEndpointFromAddress(externalEndpointAddress)];
  }

  public sendNodeUpdateTransaction(): SoloListrTask<NodeUpdateContext> {
    return {
      title: 'Send node update transaction',
      task: async (context_): Promise<void> => {
        const config: any = context_.config;

        const nodeId: NodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);
        this.logger.info(`nodeId: ${nodeId}, config.newAccountNumber: ${config.newAccountNumber}`);

        if (config.existingNodeAliases.length > 1) {
          config.nodeClient = await this.accountManager.refreshNodeClient(
            config.namespace,
            this.remoteConfig.getClusterRefs(),
            this.configManager.getFlag<DeploymentName>(flags.deployment),
            undefined,
            {type: 'all', skipNodeAlias: config.nodeAlias},
          );
        }

        let nodeUpdateTx: any = new NodeUpdateTransaction().setNodeId(new Long(nodeId));
        nodeUpdateTx = nodeUpdateTx.setGossipEndpoints(await this.prepareNodeUpdateGossipEndpoints(config));

        if (config.tlsPublicKey && config.tlsPrivateKey) {
          this.logger.info(`config.tlsPublicKey: ${config.tlsPublicKey}`);
          const tlsCertDer: Uint8Array<ArrayBuffer> = this.keyManager.getDerFromPemCertificate(config.tlsPublicKey);
          const tlsCertHash: Buffer = crypto.createHash('sha384').update(tlsCertDer).digest();
          nodeUpdateTx = nodeUpdateTx.setCertificateHash(tlsCertHash);

          const publicKeyFile: string = Templates.renderTLSPemPublicKeyFile(config.nodeAlias);
          const privateKeyFile: string = Templates.renderTLSPemPrivateKeyFile(config.nodeAlias);
          renameAndCopyFile(config.tlsPublicKey, publicKeyFile, config.keysDir);
          renameAndCopyFile(config.tlsPrivateKey, privateKeyFile, config.keysDir);
        }

        if (config.gossipPublicKey && config.gossipPrivateKey) {
          this.logger.info(`config.gossipPublicKey: ${config.gossipPublicKey}`);
          const signingCertDer: Uint8Array = this.keyManager.getDerFromPemCertificate(config.gossipPublicKey);
          nodeUpdateTx = nodeUpdateTx.setGossipCaCertificate(signingCertDer);

          const publicKeyFile: string = Templates.renderGossipPemPublicKeyFile(config.nodeAlias);
          const privateKeyFile: string = Templates.renderGossipPemPrivateKeyFile(config.nodeAlias);
          renameAndCopyFile(config.gossipPublicKey, publicKeyFile, config.keysDir);
          renameAndCopyFile(config.gossipPrivateKey, privateKeyFile, config.keysDir);
        }

        if (config.newAccountNumber) {
          nodeUpdateTx = nodeUpdateTx.setAccountId(config.newAccountNumber);
        }

        let parsedNewKey: PrivateKey;
        if (config.newAdminKey) {
          parsedNewKey = PrivateKey.fromStringED25519(config.newAdminKey.toString());
          nodeUpdateTx = nodeUpdateTx.setAdminKey(parsedNewKey.publicKey);
        }
        nodeUpdateTx = nodeUpdateTx.freezeWith(config.nodeClient);

        // config.adminKey contains the original key, needed to sign the transaction
        if (config.newAdminKey) {
          nodeUpdateTx = await nodeUpdateTx.sign(parsedNewKey);
        }

        // also sign with new account's key if account is being updated
        if (config.newAccountNumber) {
          const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
            config.newAccountNumber,
            config.namespace,
          );
          nodeUpdateTx = await nodeUpdateTx.sign(PrivateKey.fromStringED25519(accountKeys.privateKey));
        }

        const signedTx: NodeUpdateTransaction = await nodeUpdateTx.sign(config.adminKey);

        let txResp: TransactionResponse;
        let nodeUpdateReceipt: TransactionReceipt;
        try {
          txResp = await signedTx.execute(config.nodeClient);
          nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient);
        } catch (error) {
          throw new SoloErrors.component.nodeUpdateTransactionError(error);
        }

        this.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`);

        // If admin key was updated, save the new key to k8s secret
        if (config.newAdminKey) {
          const context: string = extractContextFromConsensusNodes(config.nodeAlias, config.consensusNodes);
          const data: {privateKey: string; publicKey: string} = {
            privateKey: Base64.encode(parsedNewKey.toString()),
            publicKey: Base64.encode(parsedNewKey.publicKey.toString()),
          };

          const isAdminKeySecretCreated: boolean = await this.k8Factory
            .getK8(context)
            .secrets()
            .createOrReplace(
              config.namespace,
              Templates.renderNodeAdminKeyName(config.nodeAlias),
              SecretType.OPAQUE,
              data,
              {
                'solo.hedera.com/node-admin-key': 'true',
              },
            );

          if (!isAdminKeySecretCreated) {
            throw new SoloErrors.system.k8sSecretCreateFailed(
              `failed to create admin key secret for node '${config.nodeAlias}'`,
            );
          }

          this.logger.debug(`Updated admin key secret for node ${config.nodeAlias}`);
        }
      },
    };
  }

  public copyNodeKeysToSecrets(
    nodeListOverride?: string,
    refreshBlockNodeRsaBootstrapState: boolean = true,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Copy node keys to secrets',
      task: (context_, task): any => {
        const consensusNodes: ConsensusNode[] = nodeListOverride
          ? context_.config[nodeListOverride]
          : context_.config.consensusNodes;
        const subTasks: any[] = this.platformInstaller.copyNodeKeys(
          context_.config.keysDir,
          consensusNodes,
          context_.config.contexts,
        );

        return task.newListr(
          [
            {
              title: 'Copy keys',
              task: (_subContext, subTask): SoloListr<any> => {
                return subTask.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
              },
            },
            {
              title: 'Refresh block node RSA bootstrap state (restarts block-node pods)',
              skip: (): boolean =>
                !refreshBlockNodeRsaBootstrapState ||
                !this.shouldRefreshBlockNodeRsaBootstrapState(context_.config, consensusNodes),
              task: async (): Promise<void> => {
                await this.refreshBlockNodeRsaBootstrapState(context_.config, consensusNodes);
              },
            },
          ],
          constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
        );
      },
    };
  }

  public refreshBlockNodeRsaBootstrapStateTask(
    nodeListOverride?: string,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Refresh block node RSA bootstrap state (restarts block-node pods)',
      skip: (context_: NodeUpdateContext | NodeAddContext | NodeDestroyContext): boolean =>
        !this.shouldRefreshBlockNodeRsaBootstrapState(
          context_.config,
          nodeListOverride ? context_.config[nodeListOverride] : context_.config.consensusNodes,
        ),
      task: async (context_: NodeUpdateContext | NodeAddContext | NodeDestroyContext): Promise<void> => {
        const consensusNodes: ConsensusNode[] = nodeListOverride
          ? context_.config[nodeListOverride]
          : context_.config.consensusNodes;

        await this.refreshBlockNodeRsaBootstrapState(context_.config, consensusNodes);
      },
    };
  }

  private shouldRefreshBlockNodeRsaBootstrapState(
    config: NodeUpdateConfigClass | NodeAddConfigClass | NodeDestroyConfigClass,
    consensusNodes: ConsensusNode[],
  ): boolean {
    if (this.remoteConfig.configuration.state.blockNodes.length === 0 || consensusNodes.length === 0) {
      return false;
    }

    const consensusNodeVersion: SemanticVersion<string> = new SemanticVersion<string>(
      this.remoteConfig.configuration.versions?.consensusNode?.toString() || HEDERA_PLATFORM_VERSION,
    );
    if (consensusNodeVersion.lessThan(MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS)) {
      return false;
    }

    const blockStreamMode: string = constants.getEnvironmentVariable('BLOCK_STREAM_STREAM_MODE') ?? 'BLOCKS';
    if (blockStreamMode !== 'BLOCKS' && blockStreamMode !== 'BOTH') {
      return false;
    }

    for (const consensusNode of consensusNodes) {
      const publicKeyFile: string = PathEx.join(
        config.keysDir,
        Templates.renderGossipPemPublicKeyFile(consensusNode.name),
      );
      if (!fs.existsSync(publicKeyFile)) {
        this.logger.debug(`Skipping block node RSA bootstrap refresh, missing ${publicKeyFile}`);
        return false;
      }
    }

    return true;
  }

  private async refreshBlockNodeRsaBootstrapState(
    config: NodeUpdateConfigClass | NodeAddConfigClass | NodeDestroyConfigClass,
    consensusNodes: ConsensusNode[],
  ): Promise<void> {
    const bootstrapJson: Optional<string> = Helpers.buildRsaAddressBookJson(consensusNodes, config.keysDir);
    if (!bootstrapJson) {
      this.logger.debug('Skipping block node RSA bootstrap refresh because a public key is missing');
      return;
    }
    const bootstrapFilePath: string = PathEx.join(config.keysDir, NodeCommandTasks.BLOCK_NODE_RSA_BOOTSTRAP_FILE);
    fs.writeFileSync(bootstrapFilePath, bootstrapJson, 'utf8');

    const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();
    for (const blockNode of this.remoteConfig.configuration.state.blockNodes) {
      const context: Context | undefined = clusterReferences.get(blockNode.metadata.cluster);
      if (!context) {
        throw new SoloErrors.deployment.blockNodeClusterContextNotFound(String(blockNode.metadata.id));
      }

      const namespace: NamespaceName = NamespaceName.of(blockNode.metadata.namespace.toString());
      const podName: string = `${Templates.renderBlockNodeName(blockNode.metadata.id)}-0`;
      const k8: K8 = this.k8Factory.getK8(context);
      const containerReference: ContainerReference = ContainerReference.of(
        PodReference.of(namespace, PodName.of(podName)),
        constants.BLOCK_NODE_CONTAINER_NAME,
      );
      const podReference: PodReference = containerReference.parentReference;
      const pod: Pod = await k8.pods().read(podReference);
      const blockNodeContainer: Container = k8.containers().readByRef(containerReference);

      await blockNodeContainer.execContainer(['mkdir', '-p', NodeCommandTasks.BLOCK_NODE_APPLICATION_STATE_DIRECTORY]);
      await blockNodeContainer.copyTo(bootstrapFilePath, NodeCommandTasks.BLOCK_NODE_APPLICATION_STATE_DIRECTORY);
      await blockNodeContainer.execContainer([
        'test',
        '-r',
        `${NodeCommandTasks.BLOCK_NODE_APPLICATION_STATE_DIRECTORY}/${NodeCommandTasks.BLOCK_NODE_RSA_BOOTSTRAP_FILE}`,
      ]);

      await k8.pods().delete(podReference);

      await this.waitForBlockNodePodRecreated(k8, podReference, pod.creationTimestamp);
    }
  }

  private async waitForBlockNodePodRecreated(
    k8: K8,
    podReference: PodReference,
    previousCreationTimestamp?: Date,
  ): Promise<void> {
    await k8
      .pods()
      .waitForReadyStatus(
        podReference.namespace,
        [`statefulset.kubernetes.io/pod-name=${podReference.name.toString()}`],
        constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
        constants.BLOCK_NODE_PODS_RUNNING_DELAY,
        previousCreationTimestamp,
        true,
      );
  }

  public removeCachedKeys(): SoloListrTask<NodeUpdateContext | NodeAddContext> {
    return {
      title: 'Remove cached keys',
      // copyNodeKeysToSecrets already uploaded the keys to the cluster secrets, and later commands re-read them
      // from those secrets, so delete the on-disk copies to avoid leaving private keys in SOLO_CACHE_DIR. Kept
      // when --debug is enabled. Runs last so every task that consumes keysDir has already read it.
      skip: (): boolean | string =>
        this.configManager.getFlag<boolean>(flags.debugMode) ? '--debug enabled, keeping cached keys on disk' : false,
      task: ({config: {keysDir}}): void => {
        if (keysDir && fs.existsSync(keysDir)) {
          fs.rmSync(keysDir, {recursive: true, force: true});
        }
      },
    };
  }

  public addWrapsLib(): SoloListrTask<{config: NodeCommonConfigClass}> {
    return {
      title: 'Copy wraps lib over',
      skip: (): boolean => !this.remoteConfig.configuration.state.wrapsEnabled,
      task: async ({config}): Promise<void> => {
        const wraps: Wraps = this.soloConfig.tss.wraps;
        const extractedDirectory: string = PathEx.join(constants.SOLO_CACHE_DIR, wraps.directoryName);
        const wrapsKeyPath: string = this.configManager.getFlag<string>(flags.wrapsKeyPath);

        if (wrapsKeyPath) {
          // Use user-provided local directory containing WRAPs proving key files
          if (!fs.existsSync(wrapsKeyPath)) {
            throw new SoloErrors.validation.wrapsKeyPathNotFound(wrapsKeyPath);
          }

          if (!fs.existsSync(extractedDirectory)) {
            fs.mkdirSync(extractedDirectory, {recursive: true});
          }

          const allowedFiles: Set<string> = wraps.allowedKeyFileSet;

          for (const file of fs.readdirSync(wrapsKeyPath)) {
            if (allowedFiles.has(file)) {
              fs.copyFileSync(PathEx.join(wrapsKeyPath, file), PathEx.join(extractedDirectory, file));
            }
          }
        } else {
          await this.downloader.fetchPackage(
            wraps.libraryDownloadUrl,
            'unusued', // doesn't check checksum
            constants.SOLO_CACHE_DIR,
            false,
            '',
            false,
          );

          const tarFilePath: string = PathEx.join(constants.SOLO_CACHE_DIR, `${wraps.directoryName}.tar.gz`);

          // Create extraction dir
          fs.mkdirSync(extractedDirectory);

          // Extract wraps-v0.2.0.tar.gz -> wraps-v0.2.0
          this.zippy.untar(tarFilePath, constants.SOLO_CACHE_DIR);
        }

        for (const consensusNode of config.consensusNodes) {
          const rootContainer: Container = await new K8Helper(consensusNode.context).getConsensusNodeRootContainer(
            config.namespace,
            consensusNode.name,
          );

          const targetWrapsPath: string = `${constants.HEDERA_HAPI_PATH}/data/keys/${wraps.directoryName}`;

          const attempts: number = CHECK_WRAPS_DIRECTORY_MAX_ATTEMPTS;
          let attempt: number = 0;
          let found: boolean = false;
          while (attempt < attempts) {
            try {
              if (await rootContainer.execContainer(`test -d "${targetWrapsPath}"`)) {
                found = true;
                break;
              }
            } catch {
              this.logger.info(
                `Attempt ${attempt}/${attempts}: WRAPs directory not found in node ${consensusNode.name}. Retrying...`,
              );
              await sleep(Duration.ofMillis(CHECK_WRAPS_DIRECTORY_BACKOFF_MS));
              attempt++;
            }
          }

          if (found) {
            continue;
          }

          await rootContainer.copyTo(extractedDirectory, `${constants.HEDERA_HAPI_PATH}/data/keys`);
        }
      },
    };
  }

  public updateChartWithConfigMap(
    title: string,
    transactionType: NodeSubcommandType,
    skip: SkipCheck | boolean = false,
  ): SoloListrTask<NodeDestroyContext | NodeAddContext | NodeUpdateContext> {
    return {
      title,
      task: async (context_): Promise<void> => {
        // Prepare parameter and update the network node chart
        const config: NodeDestroyConfigClass | NodeAddConfigClass | NodeUpdateConfigClass = context_.config;
        const consensusNodes: ConsensusNode[] = context_.config.consensusNodes;
        const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

        // Make sure valuesArgMap is initialized with empty strings
        const nodeChartValuesMap: Record<ClusterReferenceName, HelmChartValues> = {};
        for (const [clusterReference] of clusterReferences) {
          nodeChartValuesMap[clusterReference] = new HelmChartValues();
        }

        config.serviceMap ||= await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );

        let maxNodeId: NodeId = 0;
        for (const nodeAlias of config.existingNodeAliases) {
          maxNodeId = Math.max(Templates.nodeIdFromNodeAlias(nodeAlias), maxNodeId);
        }

        const nodeId: NodeId = maxNodeId + 1;

        const clusterNodeIndexMap: Record<
          ClusterReferenceName,
          Record<NodeId, /* index in the chart -> */ number>
        > = {};

        for (const [clusterReference] of clusterReferences) {
          clusterNodeIndexMap[clusterReference] = {};

          const nodesInCluster: ConsensusNode[] = consensusNodes
            .filter((node: ConsensusNode): boolean => node.cluster === clusterReference)
            // eslint-disable-next-line unicorn/no-array-sort
            .sort((a: ConsensusNode, b: ConsensusNode): number => a.nodeId - b.nodeId);

          for (const [index, node] of nodesInCluster.entries()) {
            clusterNodeIndexMap[clusterReference][node.nodeId] = index;
          }
        }

        switch (transactionType) {
          case NodeSubcommandType.UPDATE: {
            this.prepareHelmChartValuesForNodeUpdate(
              consensusNodes,
              nodeChartValuesMap,
              config.serviceMap,
              clusterNodeIndexMap,
              (config as NodeUpdateConfigClass).newAccountNumber,
              config.nodeAlias,
            );
            break;
          }
          case NodeSubcommandType.DESTROY: {
            this.prepareHelmChartValuesForNodeDestroy(
              consensusNodes,
              nodeChartValuesMap,
              config.nodeAlias,
              config.serviceMap,
              clusterReferences,
            );
            break;
          }
          case NodeSubcommandType.ADD: {
            this.prepareHelmChartValuesForNodeAdd(
              consensusNodes,
              nodeChartValuesMap,
              config.serviceMap,
              clusterNodeIndexMap,
              (config as NodeAddConfigClass).clusterRef,
              nodeId,
              config.nodeAlias,
              (context_ as NodeAddContext).newNode,
              config as NodeAddConfigClass,
            );
            break;
          }
        }

        // Add profile values files
        const profileValuesFile: string = await this.profileManager.prepareValuesForNodeTransaction(
          PathEx.joinWithRealPath(config.stagingDir, 'templates', constants.APPLICATION_PROPERTIES),
        );

        const valuesFilesMap: Record<ClusterReferenceName, HelmChartValues> = {};
        const valueFilePathsMap: Record<ClusterReferenceName, string[]> = {};
        for (const [clusterReference] of clusterReferences) {
          valuesFilesMap[clusterReference] = new HelmChartValues();
          valueFilePathsMap[clusterReference] = [];
        }

        if (profileValuesFile) {
          const preparedValuesFiles: {
            chartValuesMap: Record<ClusterReferenceName, HelmChartValues>;
            valueFilePathsMap: Record<ClusterReferenceName, string[]>;
          } = this.prepareHelmChartValuesFilesMap(
            clusterReferences,
            undefined, // do not trigger of adding default value file for chart upgrade due to consensus node add or destroy
            {[flags.KEY_COMMON]: profileValuesFile},
            (config as any).valuesFile,
          );

          for (const clusterReference of Object.keys(preparedValuesFiles.chartValuesMap)) {
            valuesFilesMap[clusterReference] = preparedValuesFiles.chartValuesMap[clusterReference];
            valueFilePathsMap[clusterReference] = preparedValuesFiles.valueFilePathsMap[clusterReference];
            this.logger.debug(`Prepared helm chart values for cluster-ref: ${clusterReference}`, {
              valueArguments: valuesFilesMap[clusterReference].toArguments(),
            });
          }
        }

        // Generate extraEnv values file for wraps, debug, and custom environment variables
        // This replaces the old --set extraEnv approach to prevent Helm replacement issues
        const needsExtraEnvironment: boolean =
          this.remoteConfig.configuration.state.wrapsEnabled || !!config.debugNodeAlias;

        if (needsExtraEnvironment) {
          for (const [clusterReference] of clusterReferences) {
            // Collect extraEnv entries already present in the values files applied to this
            // cluster so that the generated file can include them and avoid Helm array
            // replacement silently dropping env vars set by user-provided values files.
            // Always include the chart's own defaults file so default JAVA_OPTS/heap vars
            // are preserved when no per-node override exists in the user-provided files.
            const existingValuesFilePaths: string[] = [constants.SOLO_DEPLOYMENT_VALUES_FILE];
            const userValueFilePaths: string[] = valuesFilesMap[clusterReference]?.userValueFilePaths() ?? [];
            for (const filePath of valueFilePathsMap[clusterReference] ?? []) {
              if (!existingValuesFilePaths.includes(filePath)) {
                existingValuesFilePaths.push(filePath);
              }
            }

            const clusterLocalNodeIndices: Record<NodeId, number> | undefined = clusterNodeIndexMap[clusterReference];
            const indexedConsensusNodes: Array<ConsensusNode | undefined> = [];
            const unindexedConsensusNodes: ConsensusNode[] = [];
            for (const consensusNode of consensusNodes) {
              const nodeIndex: number | undefined = clusterLocalNodeIndices?.[consensusNode.nodeId];
              if (nodeIndex === undefined) {
                unindexedConsensusNodes.push(consensusNode);
                continue;
              }
              indexedConsensusNodes[nodeIndex] = consensusNode;
            }
            const clusterConsensusNodes: ConsensusNode[] = [
              ...indexedConsensusNodes.filter((node): node is ConsensusNode => node !== undefined),
              ...unindexedConsensusNodes,
            ];
            const extraEnvironmentWarnings: string[] = helmValuesHelper.describeUserProvidedExtraEnvironmentWarnings(
              userValueFilePaths,
              clusterConsensusNodes,
              {
                wrapsEnabled: this.remoteConfig.configuration.state.wrapsEnabled,
                tss: this.soloConfig.tss,
                debugNodeAlias: config.debugNodeAlias,
                useJavaMainClass: false,
              },
            );
            for (const warning of extraEnvironmentWarnings) {
              this.logger.showUserUnlessOneShot(chalk.yellow(warning));
            }

            const extraEnvironmentValuesFile: string = helmValuesHelper.generateExtraEnvironmentValuesFile(
              clusterConsensusNodes,
              {
                wrapsEnabled: this.remoteConfig.configuration.state.wrapsEnabled,
                tss: this.soloConfig.tss,
                debugNodeAlias: config.debugNodeAlias,
                useJavaMainClass: false,
                baseExtraEnvironmentVariables: helmValuesHelper.extractExtraEnvironmentFromValuesFiles(
                  existingValuesFilePaths,
                  clusterConsensusNodes,
                ),
              },
              constants.SOLO_CACHE_DIR,
            );
            // Place the generated extraEnv file last (after user files) so that Solo-injected
            // env vars like TSS_LIB_WRAPS_ARTIFACTS_PATH are not wiped out by a user-provided
            // values file that also defines hedera.nodes[*].root.extraEnv. The generated file
            // already merges the user's extraEnv entries via baseExtraEnvironmentVariables.
            valuesFilesMap[clusterReference].userFile(extraEnvironmentValuesFile);
          }
        }

        const clusterReferencesList: ClusterReferenceName[] = [];
        for (const [clusterReference] of clusterReferences) {
          if (!clusterReferencesList.includes(clusterReference)) {
            clusterReferencesList.push(clusterReference);
          }
        }

        // Update all charts
        await Promise.all(
          clusterReferencesList.map(async (clusterReference: string): Promise<void> => {
            const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference).toString();

            config.soloChartVersion = SemanticVersion.getValidSemanticVersion(
              config.soloChartVersion,
              false,
              'Solo chart version',
              MINIMUM_SOLO_CHART_VERSION,
            );
            const chartValues: HelmChartValues = nodeChartValuesMap[clusterReference]
              .clone()
              .add(valuesFilesMap[clusterReference]);

            await this.chartManager.upgrade(
              config.namespace,
              constants.SOLO_DEPLOYMENT_CHART,
              constants.SOLO_DEPLOYMENT_CHART,
              config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
              config.soloChartVersion,
              chartValues,
              context,
              true,
            );
            showVersionBanner(this.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion, 'Upgraded');
          }),
        );
      },
      skip,
    };
  }

  /**
   * Prepare the values files map for each cluster
   * @param clusterReferences
   * @param chartDirectory
   * @param profileValuesFile
   * @param valuesFileInput
   */
  private prepareHelmChartValuesFilesMap(
    clusterReferences: ClusterReferences,
    chartDirectory?: string,
    profileValuesFile?: Record<string, string>,
    valuesFileInput?: string,
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

  /**
   * Append root.image registry/repository/tag settings for a given node path to Helm chart values.
   * @param chartValues - existing chart values
   * @param nodePath - base node path, e.g. `hedera.nodes[0]`
   * @param registry - image registry
   * @param repository - image repository
   * @param tag - image tag
   */
  private addRootImageValues(
    chartValues: HelmChartValues,
    nodePath: string,
    registry: string,
    repository: string,
    tag: string,
  ): void {
    chartValues
      .setLiteral(`${nodePath}.root.image.registry`, registry)
      .setLiteral(`${nodePath}.root.image.tag`, tag)
      .setLiteral(`${nodePath}.root.image.repository`, repository);
  }

  /**
   * Builds the values args for update:
   * - Updates the selected node
   * - Keep the rest the same
   */
  private prepareHelmChartValuesForNodeUpdate(
    consensusNodes: ConsensusNode[],
    chartValuesMap: Record<ClusterReferenceName, HelmChartValues>,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterNodeIndexMap: Record<ClusterReferenceName, Record<NodeId, /* index in the chart -> */ number>>,
    newAccountNumber: string,
    nodeAlias: NodeAlias,
  ): void {
    for (const consensusNode of consensusNodes) {
      const clusterReference: string = consensusNode.cluster;
      const index: number = clusterNodeIndexMap[clusterReference][consensusNode.nodeId];
      const chartValues: HelmChartValues = chartValuesMap[clusterReference];

      if (newAccountNumber && consensusNode.name === nodeAlias) {
        chartValues
          .set(`hedera.nodes[${index}].accountId`, newAccountNumber)
          .set(`hedera.nodes[${index}].name`, nodeAlias)
          .set(`hedera.nodes[${index}].nodeId`, consensusNode.nodeId);
      } else {
        chartValues
          .set(`hedera.nodes[${index}].accountId`, serviceMap.get(consensusNode.name).accountId)
          .set(`hedera.nodes[${index}].name`, consensusNode.name)
          .set(`hedera.nodes[${index}].nodeId`, consensusNode.nodeId);
      }

      // TSS wraps extraEnv is handled via generateExtraEnvironmentValuesFile()
    }
  }

  /**
   * Builds the values args for add:
   * - Adds the new node
   * - Keeps the rest the same
   */
  private prepareHelmChartValuesForNodeAdd(
    consensusNodes: ConsensusNode[],
    chartValuesMap: Record<ClusterReferenceName, HelmChartValues>,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterNodeIndexMap: Record<ClusterReferenceName, Record<NodeId, /* index in the chart -> */ number>>,
    clusterReference: ClusterReferenceName,
    nodeId: NodeId,
    nodeAlias: NodeAlias,
    newNode: {accountId: string; name: NodeAlias},
    config: {
      haproxyIps?: string;
      haproxyIpsParsed?: Record<NodeAlias, IP>;
      envoyIps?: string;
      envoyIpsParsed?: Record<NodeAlias, IP>;
    },
  ): void {
    // Add existing nodes
    for (const node of consensusNodes) {
      if (node.name === nodeAlias) {
        continue;
      }
      const index: number = clusterNodeIndexMap[node.cluster][node.nodeId];
      const chartValues: HelmChartValues = chartValuesMap[node.cluster];

      chartValues
        .set(`hedera.nodes[${index}].accountId`, serviceMap.get(node.name).accountId)
        .set(`hedera.nodes[${index}].name`, node.name)
        .set(`hedera.nodes[${index}].nodeId`, node.nodeId);
    }

    // Add new node
    const index: number = clusterNodeIndexMap[clusterReference][nodeId];
    const chartValues: HelmChartValues = chartValuesMap[clusterReference];
    chartValues
      .set(`hedera.nodes[${index}].accountId`, newNode.accountId)
      .set(`hedera.nodes[${index}].name`, newNode.name)
      .set(`hedera.nodes[${index}].nodeId`, nodeId);

    // Set static IPs for HAProxy
    if (config.haproxyIps) {
      config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
      const ip: string = config.haproxyIpsParsed?.[nodeAlias];
      if (ip) {
        chartValues.set(`hedera.nodes[${index}].haproxyStaticIP`, ip);
      }
    }

    // Set static IPs for Envoy Proxy
    if (config.envoyIps) {
      config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
      const ip: string = config.envoyIpsParsed?.[nodeAlias];
      if (ip) {
        chartValues.set(`hedera.nodes[${index}].envoyProxyStaticIP`, ip);
      }
    }

    // TSS wraps extraEnv is handled via generateExtraEnvironmentValuesFile()
  }

  /**
   * Builds the values args for delete:
   * - Remove the specified node
   * - Keeps the rest the same
   */
  private prepareHelmChartValuesForNodeDestroy(
    consensusNodes: ConsensusNode[],
    chartValuesMap: Record<ClusterReferenceName, HelmChartValues>,
    nodeAlias: NodeAlias,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterReferences: ClusterReferences,
  ): void {
    for (const [clusterReference] of clusterReferences) {
      const nodesInCluster: ConsensusNode[] = consensusNodes
        .filter((node: ConsensusNode): boolean => node.cluster === clusterReference)
        // eslint-disable-next-line unicorn/no-array-sort
        .sort((a: ConsensusNode, b: ConsensusNode): number => a.nodeId - b.nodeId);

      let index: number = 0;

      for (const node of nodesInCluster) {
        // For nodes that are being deleted
        if (node.name === nodeAlias) {
          continue;
        }

        // For nodes that are not being deleted
        const chartValues: HelmChartValues = chartValuesMap[clusterReference];
        chartValues
          .set(`hedera.nodes[${index}].accountId`, serviceMap.get(node.name).accountId)
          .set(`hedera.nodes[${index}].name`, node.name)
          .set(`hedera.nodes[${index}].nodeId`, node.nodeId);

        // TSS wraps extraEnv is handled via generateExtraEnvironmentValuesFile()

        index++;
      }
    }

    // now remove the deleted node from the serviceMap
    serviceMap.delete(nodeAlias);
  }

  public saveContextData(
    argv: ArgvStruct,
    targetFile: string,
    parser: (context_: AnyListrContext) => AnyObject,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Save context data',
      task: (context_): void => {
        const outputDirectory: string = argv[flags.outputDir.name];
        if (!outputDirectory) {
          throw new SoloErrors.validation.outputDirectoryNotSpecified();
        }

        if (!fs.existsSync(outputDirectory)) {
          fs.mkdirSync(outputDirectory, {recursive: true});
        }
        const exportedContext: AnyObject = parser(context_);
        fs.writeFileSync(PathEx.join(outputDirectory, targetFile), JSON.stringify(exportedContext));
      },
    };
  }

  public loadContextData(
    argv: ArgvStruct,
    targetFile: string,
    parser: (context_: AnyListrContext, contextData: AnyObject) => void,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: 'Load context data',
      task: (context_): void => {
        const inputDirectory: string = argv[flags.inputDir.name];
        if (!inputDirectory) {
          throw new SoloErrors.validation.inputDirectoryNotSpecified();
        }

        const contextData: any = JSON.parse(
          fs.readFileSync(PathEx.joinWithRealPath(inputDirectory, targetFile), 'utf8'),
        );
        parser(context_, contextData);
      },
    };
  }

  public killNodes(transactionType?: NodeSubcommandType): SoloListrTask<NodeDestroyContext | NodeAddContext> {
    return {
      title: 'Kill nodes',
      task: async (context_): Promise<void> => {
        const config: any = context_.config;
        for (const service of config.serviceMap.values()) {
          // skip pod if it's not in the list of config.allNodeAliases
          if (!config.allNodeAliases.includes(service.nodeAlias)) {
            continue;
          }

          // Remove the autostart flag file BEFORE killing the pod so that when the
          // pod restarts the network-node-autostart oneshot does NOT fire prematurely
          // (i.e. before new config files are staged by later tasks).  startNodes()
          // will re-create the flag file when it is safe to start the platform.
          try {
            const podReference: PodReference = PodReference.of(config.namespace, service.nodePodName);
            const containerReference: ContainerReference = ContainerReference.of(
              podReference,
              constants.ROOT_CONTAINER,
            );
            await this.k8Factory
              .getK8(service.context)
              .containers()
              .readByRef(containerReference)
              .execContainer([
                'bash',
                '-c',
                'test -x "/command/network-node-lifecycle" && "/command/network-node-lifecycle" disable-autostart',
              ]);
          } catch {
            // Best-effort: container may already be restarting; the kill below will follow
          }

          await this.k8Factory
            .getK8(service.context)
            .pods()
            .readByReference(PodReference.of(config.namespace, service.nodePodName))
            .killPod();
        }

        // remove from remote config
        if (transactionType === NodeSubcommandType.DESTROY) {
          const nodeId: NodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);

          const componentId: ComponentId = Templates.renderComponentIdFromNodeId(nodeId);
          this.remoteConfig.configuration.components.removeComponent(componentId, ComponentTypes.ConsensusNode);
          this.remoteConfig.configuration.components.removeComponent(componentId, ComponentTypes.EnvoyProxy);
          this.remoteConfig.configuration.components.removeComponent(componentId, ComponentTypes.HaProxy);

          await this.remoteConfig.persist();

          context_.config.nodeAliases = config.allNodeAliases.filter(
            (nodeAlias: NodeAlias): boolean => nodeAlias !== config.nodeAlias,
          );
        }
      },
    };
  }

  public killNodesAndUpdateConfigMap(): SoloListrTask<NodeUpdateContext> {
    return {
      title: 'Kill nodes to pick up updated configMaps',
      task: async (context_): Promise<void> => {
        const config: any = context_.config;
        const clusterReferences: Map<ClusterReferenceName, Context> = this.remoteConfig.getClusterRefs();
        // the updated node will have a new pod ID if its account ID changed which is a label
        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );

        for (const service of config.serviceMap.values()) {
          // Disable the network-node autostart BEFORE killing the pod so the restarted
          // pod does not auto-launch the JVM while fetchPlatformSoftware is still
          // rm-ing and re-copying jars under data/lib (HederaNode.jar has an explicit
          // Class-Path manifest; a JVM that lazy-loads a jar mid-rm crashes with
          // NoSuchFileException). startNodes() re-enables autostart after the upload.
          try {
            const podReference: PodReference = PodReference.of(config.namespace, service.nodePodName);
            const containerReference: ContainerReference = ContainerReference.of(
              podReference,
              constants.ROOT_CONTAINER,
            );
            await this.k8Factory
              .getK8(service.context)
              .containers()
              .readByRef(containerReference)
              .execContainer([
                'bash',
                '-c',
                'test -x "/command/network-node-lifecycle" && "/command/network-node-lifecycle" disable-autostart',
              ]);
          } catch {
            // Best-effort: container may already be restarting; the kill below will follow
          }

          await this.k8Factory
            .getK8(service.context)
            .pods()
            .readByReference(PodReference.of(config.namespace, service.nodePodName))
            .killPod();
        }

        // again, the pod names will change after the pods are killed
        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );

        config.podRefs = {};
        for (const service of config.serviceMap.values()) {
          config.podRefs[service.nodeAlias] = PodReference.of(service.namespace, service.nodePodName);
        }
      },
    };
  }

  public checkNodePodsAreRunning(): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Check node pods are running',
      task: (context_, task): any => {
        const config: any = context_.config;
        const subTasks: SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext>[] = [];

        for (const nodeAlias of config.allNodeAliases) {
          const context: Context = extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
          subTasks.push({
            title: `Check Node: ${chalk.yellow(nodeAlias)}`,
            task: async (): Promise<void> => {
              await this.k8Factory
                .getK8(context)
                .pods()
                .waitForRunningPhase(
                  config.namespace,
                  [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'],
                  constants.PODS_RUNNING_MAX_ATTEMPTS,
                  constants.PODS_RUNNING_DELAY,
                ); // timeout 15 minutes
            },
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, {concurrent: true, rendererOptions: {collapseSubtasks: false}});
      },
    };
  }

  public sleep(title: string, milliseconds: number): SoloListrTask<AnyListrContext> {
    return {
      title,
      task: async (): Promise<void> => {
        await sleep(Duration.ofMillis(milliseconds));
      },
    };
  }

  public drainBlockStreamAfterFreeze<
    ContextType extends {config: {freezeBlockDrainSeconds: number}},
  >(): SoloListrTask<ContextType> {
    return {
      title: 'Drain block stream after freeze',
      task: async (context_: ContextType): Promise<void> => {
        const drainSeconds: number = context_.config.freezeBlockDrainSeconds ?? 20;
        await sleep(Duration.ofSeconds(drainSeconds));
      },
    };
  }

  public downloadLastState(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Download last state from an existing node',
      task: async ({config}): Promise<void> => {
        const {consensusNodes, namespace, stagingDir} = config;

        // TODO: currently only supports downloading from the first existing node
        const node: ConsensusNode = consensusNodes[0];
        const upgradeDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/0/123`;

        const container: Container = await new K8Helper(node.context).getConsensusNodeRootContainer(
          namespace,
          node.name,
        );

        // Use the -X to archive for cross-platform compatibility
        const archiveCommand: string =
          'cd "${states[0]}" && zip -rX "${states[0]}.zip" . >/dev/null && sleep 1 && cd ../ && mv "${states[0]}/${states[0]}.zip" "${states[0]}.zip"';

        // zip the contents of the newest folder on node1 within /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/
        const zipFileName: string = await container.execContainer([
          'bash',
          '-c',
          `cd ${upgradeDirectory} && mapfile -t states < <(ls -1 . | sort -nr) && ${archiveCommand} && echo -n \${states[0]}.zip`,
        ]);

        this.logger.debug(`state zip file to download is = ${zipFileName}`);

        await container.copyFrom(`${upgradeDirectory}/${zipFileName}`, stagingDir);

        config.lastStateZipPath = PathEx.joinWithRealPath(stagingDir, zipFileName);
      },
    };
  }

  public uploadStateToNewNode(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Upload last saved state to new network node',
      task: async (context_): Promise<void> => {
        const config: NodeAddConfigClass = context_.config;
        const nodeAlias: NodeAlias = config.nodeAlias || config.nodeAliases[0];
        const newNodeFullyQualifiedPodName: PodName = Templates.renderNetworkPodName(nodeAlias);
        const podReference: PodReference = PodReference.of(config.namespace, newNodeFullyQualifiedPodName);
        const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const nodeId: NodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
        const savedStateDirectory: string = config.lastStateZipPath.match(/\/(\d+)\.zip$/)[1];
        const savedStatePath: string = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/${nodeId}/123/${savedStateDirectory}`;

        const context: string = extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
        const k8: K8 = this.k8Factory.getK8(context);

        const container: Container = k8.containers().readByRef(containerReference);

        await container.execContainer(['bash', '-c', `mkdir -p ${savedStatePath}`]);
        await k8.containers().readByRef(containerReference).copyTo(config.lastStateZipPath, savedStatePath);

        await this.platformInstaller.setPathPermission(
          podReference,
          constants.HEDERA_HAPI_PATH,
          undefined,
          undefined,
          undefined,
          context,
        );

        const extractCommand: string = `unzip ${PathEx.basename(config.lastStateZipPath)}`;

        const normalizePreconsensusEventsCommand: string = [
          `cd ${savedStatePath}`,
          extractCommand,
          `if [ -d preconsensus-events/0 ] && [ "${nodeId}" != "0" ]; then ` +
            `rm -rf preconsensus-events/${nodeId} && mv preconsensus-events/0 preconsensus-events/${nodeId}; ` +
            'fi',
          `rm -f ${PathEx.basename(config.lastStateZipPath)}`,
        ].join(' && ');

        await k8
          .containers()
          .readByRef(containerReference)
          .execContainer(['bash', '-c', normalizePreconsensusEventsCommand]);
      },
    };
  }

  public sendNodeDeleteTransaction(): SoloListrTask<NodeDestroyContext> {
    return {
      title: 'Send node delete transaction',
      task: async (context_): Promise<void> => {
        const config: NodeDestroyConfigClass = context_.config;

        const deploymentName: string = this.configManager.getFlag<DeploymentName>(flags.deployment);
        const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(
          config.existingNodeAliases,
          deploymentName,
        );
        const deleteAccountId: string = accountMap.get(config.nodeAlias);
        this.logger.debug(`Deleting node: ${config.nodeAlias} with account: ${deleteAccountId}`);

        const nodeId: NodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);

        const nodeDeleteTransaction: NodeDeleteTransaction = new NodeDeleteTransaction()
          .setNodeId(new Long(nodeId))
          .freezeWith(config.nodeClient);

        let signedTransaction: NodeDeleteTransaction;
        let transactionResponse: TransactionResponse;
        let nodeDeleteReceipt: TransactionReceipt;
        try {
          signedTransaction = await nodeDeleteTransaction.sign(config.adminKey);
          transactionResponse = await signedTransaction.execute(config.nodeClient);
          nodeDeleteReceipt = await transactionResponse.getReceipt(config.nodeClient);
        } catch (error) {
          throw new SoloErrors.component.nodeDeleteTransactionError(error);
        }

        this.logger.debug(`NodeDeleteReceipt: ${nodeDeleteReceipt.toString()}`);

        if (nodeDeleteReceipt.status !== Status.Success) {
          throw new SoloErrors.component.nodeTransactionFailed('Node delete', nodeDeleteReceipt.status.toString());
        }

        // Delete admin key secret from k8s after successful node deletion
        try {
          const context: string = extractContextFromConsensusNodes(config.nodeAlias, config.consensusNodes);
          await this.k8Factory
            .getK8(context)
            .secrets()
            .delete(config.namespace, Templates.renderNodeAdminKeyName(config.nodeAlias));
          this.logger.debug(`Deleted admin key secret for node ${config.nodeAlias} from k8s`);
        } catch (deleteError) {
          // Log but don't fail the delete operation if secret doesn't exist or can't be deleted
          this.logger.debug(`Could not delete admin key secret for ${config.nodeAlias}: ${deleteError.message}`);
        }
      },
    };
  }

  public sendNodeCreateTransaction(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Send node create transaction',
      task: async (context_): Promise<void> => {
        const config: NodeAddConfigClass = context_.config;

        const nodeCreateTransaction: NodeCreateTransaction = new NodeCreateTransaction()
          .setAccountId(context_.newNode.accountId)
          .setGossipEndpoints(context_.gossipEndpoints)
          .setServiceEndpoints(context_.grpcServiceEndpoints)
          .setGossipCaCertificate(context_.signingCertDer)
          .setCertificateHash(context_.tlsCertHash)
          .setAdminKey(context_.adminKey.publicKey)
          .freezeWith(config.nodeClient);

        let signedTransaction: NodeCreateTransaction;
        let txResp: TransactionResponse;
        let nodeCreateReceipt: TransactionReceipt;
        try {
          const accountKeys: AccountIdWithKeyPairObject = await this.accountManager.getAccountKeysFromSecret(
            context_.newNode.accountId,
            config.namespace,
          );

          // v0.75+ requires accountId signature when the account already exists.
          signedTransaction = await nodeCreateTransaction.sign(PrivateKey.fromString(accountKeys.privateKey));
          signedTransaction = await signedTransaction.sign(context_.adminKey);
          txResp = await signedTransaction.execute(config.nodeClient);
          nodeCreateReceipt = await txResp.getReceipt(config.nodeClient);
        } catch (error) {
          throw new SoloErrors.component.nodeCreateTransactionError(error);
        }

        this.logger.debug(`NodeCreateReceipt: ${nodeCreateReceipt.toString()}`);

        if (nodeCreateReceipt.status !== Status.Success) {
          throw new SoloErrors.component.nodeTransactionFailed('Node Create', nodeCreateReceipt.status.toString());
        }

        // Save admin key to k8s secret after successful node creation
        // nodeAlias was set in determineNewNodeAccountNumber step
        const nodeAlias: NodeAlias = config.nodeAlias;
        const context: string = extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
        const data: {privateKey: string; publicKey: string} = {
          privateKey: Base64.encode(context_.adminKey.toString()),
          publicKey: Base64.encode(context_.adminKey.publicKey.toString()),
        };

        await this.k8Factory
          .getK8(context)
          .secrets()
          .createOrReplace(config.namespace, Templates.renderNodeAdminKeyName(nodeAlias), SecretType.OPAQUE, data, {
            'solo.hedera.com/node-admin-key': 'true',
          });

        this.logger.debug(`Saved admin key for node ${nodeAlias} to k8s secret`);
      },
    };
  }

  public initialize(
    argv: ArgvStruct,
    configInit: ConfigBuilder,
    lease?: Lock,
    shouldLoadNodeClient: boolean = true,
    validateRemoteConfig: boolean = true,
  ): SoloListrTask<AnyListrContext> {
    const {required, optional} = argv;
    argv.flags = [...required, ...optional];

    return {
      title: 'Initialize',
      task: async (context_, task): Promise<SoloListr<AnyListrContext> | void> => {
        await this.localConfig.load();
        await this.remoteConfig.loadAndValidate(argv, validateRemoteConfig);

        if (argv[flags.debugMode.name]) {
          this.logger.setDevMode(true);
        }

        this.configManager.update(argv);

        // disable the prompts that we don't want to prompt the user for
        flags.disablePrompts(optional);

        const flagsToPrompt: any[] = [];
        for (const pFlag of required) {
          if (argv[pFlag.name] === undefined) {
            flagsToPrompt.push(pFlag);
          }
        }

        await this.configManager.executePrompt(task, flagsToPrompt);

        const config: AnyListrContext = await configInit(argv, context_, task, shouldLoadNodeClient);
        context_.config = config;
        config.consensusNodes = this.remoteConfig.getConsensusNodes();
        config.contexts = this.remoteConfig.getContexts();

        for (const flag of required) {
          if (config[flag.constName] === undefined) {
            throw new SoloErrors.validation.missingArgument(`No value set for required flag: ${flag.name}`);
          }
        }

        if (!this.oneShotState.isActive() && lease) {
          return ListrLock.newAcquireLockTask(lease, task);
        }
      },
    };
  }

  public addNewConsensusNodeToRemoteConfig(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Add new node to remote config',
      task: async (context_, task): Promise<void> => {
        const nodeAlias: NodeAlias = context_.config.nodeAlias;
        const nodeId: NodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
        const namespace: NamespaceName = context_.config.namespace;
        const clusterReference: ClusterReferenceName = context_.config.clusterRef;
        const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference)?.toString();

        task.title += `: ${nodeAlias}`;

        const blockNodeIdsRaw: string = this.configManager.getFlag(flags.blockNodeMapping);
        const externalBlockNodeIdsRaw: string = this.configManager.getFlag(flags.externalBlockNodeMapping);

        const fallbackIdsForBlockNodes: ComponentId[] = NodeCommandTasks.getDefaultBlockNodeIdsForCluster(
          this.remoteConfig.configuration.state.blockNodes,
          clusterReference,
        );

        const fallbackIdsForExternalBlockNodes: ComponentId[] =
          this.remoteConfig.configuration.state.externalBlockNodes.map((node): ComponentId => node.id);

        const blockNodeMap: PriorityMapping[] = Templates.parseConsensusNodePriorityMapping(
          blockNodeIdsRaw,
          fallbackIdsForBlockNodes,
        );

        const externalBlockNodeMap: PriorityMapping[] = Templates.parseConsensusNodePriorityMapping(
          externalBlockNodeIdsRaw,
          fallbackIdsForExternalBlockNodes,
        );

        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewConsensusNodeComponent(
            Templates.renderComponentIdFromNodeId(nodeId),
            clusterReference,
            namespace,
            DeploymentPhase.STARTED,
            undefined,
            blockNodeMap,
            externalBlockNodeMap,
          ),
          ComponentTypes.ConsensusNode,
        );

        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewEnvoyProxyComponent(clusterReference, namespace),
          ComponentTypes.EnvoyProxy,
        );

        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewHaProxyComponent(clusterReference, namespace),
          ComponentTypes.HaProxy,
        );

        await this.remoteConfig.persist();

        context_.config.consensusNodes = this.remoteConfig.getConsensusNodes();

        // if the consensusNodes does not contain the nodeAlias then add it
        if (!context_.config.consensusNodes.some((node: ConsensusNode): boolean => node.name === nodeAlias)) {
          const cluster: ClusterSchema = this.remoteConfig.configuration.clusters.find(
            (cluster: Readonly<ClusterSchema>): boolean => cluster.name === clusterReference,
          );

          context_.config.consensusNodes.push(
            new ConsensusNode(
              nodeAlias,
              nodeId,
              namespace.name,
              clusterReference,
              context.toString(),
              cluster.dnsBaseDomain,
              cluster.dnsConsensusNodePattern,
              Templates.renderConsensusNodeFullyQualifiedDomainName(
                nodeAlias,
                nodeId,
                namespace.name,
                clusterReference,
                cluster.dnsBaseDomain,
                cluster.dnsConsensusNodePattern,
              ),
              [],
              [],
            ),
          );
        }
      },
    };
  }

  public updateBlockNodesJson(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Update block-nodes.json',
      skip: (): boolean =>
        this.remoteConfig.configuration.state.blockNodes.length === 0 &&
        this.remoteConfig.configuration.state.externalBlockNodes.length === 0,
      task: async (): Promise<void> => {
        for (const node of this.remoteConfig.getConsensusNodes()) {
          await createAndCopyBlockNodeJsonFileForConsensusNode(
            node,
            this.logger,
            this.k8Factory,
            false,
            this.remoteConfig.configuration.versions.consensusNode,
            this.remoteConfig.configuration.state.tssEnabled,
          );
        }
      },
    };
  }

  public downloadHieroComponentLogs(
    customOutputDirectory: string = '',
    scopeToSelectedDeployment: boolean = false,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: 'Download logs from Hiero components',
      task: async (context_: AnyListrContext, task): Promise<void> => {
        // Iterate all k8 contexts to find solo-remote-config configmaps
        this.logger.info('Discovering Hiero components from remote configuration...');
        const contexts: Contexts = this.k8Factory.default().contexts();
        const scopedContextList: string[] | undefined = scopeToSelectedDeployment
          ? context_?.config?.contexts
          : undefined;
        const scopedContextNames: ReadonlySet<string> | undefined =
          scopedContextList === undefined ? undefined : new Set<string>(scopedContextList);
        const scopedNamespaceName: NamespaceName | undefined = scopeToSelectedDeployment
          ? context_?.config?.namespace
          : undefined;
        const contextList: string[] =
          scopedContextNames === undefined
            ? contexts.list()
            : contexts.list().filter((context): boolean => scopedContextNames.has(context));
        const allPods: Array<{pod: Pod; context: string; namespace: NamespaceName}> = [];

        // Create output directory structure - use custom dir if provided, otherwise use default
        const outputDirectory: string = customOutputDirectory
          ? PathEx.resolve(customOutputDirectory)
          : PathEx.join(constants.SOLO_LOGS_DIR, 'hiero-components-logs');
        if (!fs.existsSync(outputDirectory)) {
          fs.mkdirSync(outputDirectory, {recursive: true});
        }

        for (const context of contextList) {
          const k8: K8 = this.k8Factory.getK8(context);

          try {
            this.logger.info(`Discovering Hiero component pods in context: ${context}...`);

            // Iterate through each component type and discover pods
            for (const config of NodeCommandTasks.COMPONENT_LABEL_CONFIGS) {
              const pods: Pod[] =
                scopedNamespaceName === undefined
                  ? await k8.pods().listForAllNamespaces(config.labels)
                  : await k8.pods().list(scopedNamespaceName, config.labels);
              this.logger.info(`Found ${pods.length} ${config.name} pod(s) in context ${context}`);

              for (const pod of pods) {
                const newPodInfo: {pod: Pod; context: string; namespace: NamespaceName} = {
                  pod,
                  context: context,
                  namespace: pod.podReference.namespace,
                };
                allPods.push(newPodInfo);
                // If it is block node pod, download *.log files from '/opt/hiero/block-node/logs'
                if ('block node' === config.name) {
                  await this.downloadBlockNodeLogFiles(newPodInfo, outputDirectory);
                }
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to discover pods in context ${context}: ${error}`);
          }
        }

        this.logger.info(`Logs will be saved to: ${outputDirectory}`);
        this.logger.info(`Found ${allPods.length} Hiero component pods`);
        // Download logs from each pod
        for (const podInfo of allPods) {
          await this.downloadPodLogs(podInfo, outputDirectory);
        }

        task.title = `Downloaded logs from ${allPods.length} Hiero component pods`;
      },
    };
  }

  public analyzeCollectedDiagnostics(
    customOutputDirectory: string = '',
    namespaceName?: string,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: 'Analyze collected logs for common failures',
      task: async (context_): Promise<void> => {
        try {
          const resolvedNamespace: string | undefined = namespaceName ?? context_?.config?.namespace?.name;
          new DiagnosticsAnalyzer(this.logger).analyze(customOutputDirectory, resolvedNamespace);
        } catch (error) {
          this.logger.warn(`Failed to analyze collected diagnostics: ${(error as Error).message}`);
        }
      },
    };
  }

  public reportActivePortForwards(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Report active port-forward processes',
      task: async (): Promise<void> => {
        try {
          const activeProcesses: ProcessInfo[] = await this.findActivePortForwardProcesses();
          if (activeProcesses.length === 0) {
            this.logger.showUser('No active port-forward processes found.');
          } else {
            this.logger.showUser(`Active port-forward processes (${activeProcesses.length}):`);
            for (const processInfo of activeProcesses) {
              this.logger.showUser(`  [PID ${processInfo.pid}] ${processInfo.cmd}`);
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to list port-forward processes: ${(error as Error).message}`);
        }
      },
    };
  }

  private async findActivePortForwardProcesses(): Promise<ProcessInfo[]> {
    const processNames: string[] = [
      'port-forward',
      constants.KUBECTL,
      `${constants.KUBECTL}.exe`,
      'node',
      'node.exe',
      'tsx',
      'tsx.cmd',
      'powershell',
      'powershell.exe',
    ];
    const findConfig: FindConfig = {
      skipSelf: true,
    };

    const matches: ProcessInfo[][] = await Promise.all(
      processNames.map(async (processName): Promise<ProcessInfo[]> =>
        find('name', processName, findConfig).catch((): ProcessInfo[] => []),
      ),
    );

    const uniqueByPid: Map<number, ProcessInfo> = new Map<number, ProcessInfo>();
    for (const processInfo of matches.flat()) {
      if (!processInfo?.cmd?.includes('port-forward')) {
        continue;
      }
      if (processInfo.cmd.includes('persist-port-forward')) {
        continue;
      }
      uniqueByPid.set(processInfo.pid, processInfo);
    }

    // eslint-disable-next-line unicorn/no-array-sort
    return [...uniqueByPid.values()].sort((a: ProcessInfo, b: ProcessInfo): number => a.pid - b.pid);
  }

  private async downloadPodLogs(
    podInfo: {pod: Pod; context: string; namespace: NamespaceName},
    outputDirectory: string,
  ): Promise<void> {
    const {pod, context, namespace}: {pod: Pod; context: string; namespace: NamespaceName} = podInfo;
    const podName: string = pod.podReference.name.name;

    this.logger.info(`Downloading logs from pod: ${podName} (cluster: ${context})`);

    try {
      // Create directory for this pod's logs
      const podLogDirectory: string = PathEx.join(outputDirectory, context);
      if (!fs.existsSync(podLogDirectory)) {
        fs.mkdirSync(podLogDirectory, {recursive: true});
      }

      const k8: K8 = this.k8Factory.getK8(context);
      const podReference: PodReference = PodReference.of(namespace, PodName.of(podName));

      // Fetch logs via K8 client API (cross-platform, no kubectl shell dependency).
      const logFile: string = PathEx.join(podLogDirectory, `${podName}.log`);
      this.logger.info(`Downloading logs for pod ${podName}...`);
      const logs: string = await k8.pods().readLogs(podReference, true);
      fs.writeFileSync(logFile, logs, 'utf8');
      this.logger.info(`Saved logs to ${logFile}`);

      // Fetch previous logs via K8 client API (cross-platform, no kubectl shell dependency).
      const logFile1: string = PathEx.join(podLogDirectory, `${podName}-1.log`);
      this.logger.info(`Downloading previous logs for pod ${podName}...`);
      try {
        const logs1: string = await k8.pods().readLogs(podReference, true, true);
        fs.writeFileSync(logFile1, logs1, 'utf8');
        this.logger.info(`Saved logs to ${logFile1}`);
      } catch {
        this.logger.info(`No previous logs found for pod ${podName}`);
      }

      // Save pod describe-like output (pod + events) for troubleshooting pod states/restarts/events.
      const describeFile: string = PathEx.join(podLogDirectory, `${podName}.describe.txt`);
      const describeOutput: string = await k8.pods().readDescribe(podReference);
      fs.writeFileSync(describeFile, describeOutput, 'utf8');
      this.logger.info(`Saved pod describe to ${describeFile}`);
    } catch (error) {
      this.logger.showUser(red(`Failed to download logs from pod ${podName}: ${error}`));
      this.logger.error(`Failed to download logs from pod ${podName}: ${error}`);
      // Continue with other pods even if one fails
    }
  }

  private async downloadBlockNodeLogFiles(
    podInfo: {pod: Pod; context: string; namespace: NamespaceName},
    outputDirectory: string,
  ): Promise<void> {
    const {pod, context}: {pod: Pod; context: string; namespace: NamespaceName} = podInfo;
    const podName: string = pod.podReference.name.name;

    this.logger.info(`Downloading block node log files from ${podName}...`);

    try {
      const k8: K8 = this.k8Factory.getK8(context);
      const containerReference: ContainerReference = ContainerReference.of(
        pod.podReference,
        ContainerName.of(constants.BLOCK_NODE_IMAGE_NAME),
      );
      const container: Container = k8.containers().readByRef(containerReference);

      // Create directory for block node log files
      const blockNodeLogDirectory: string = PathEx.join(outputDirectory, context, `${podName}-block-logs`);
      if (!fs.existsSync(blockNodeLogDirectory)) {
        fs.mkdirSync(blockNodeLogDirectory, {recursive: true});
      }

      const blockNodeLogsDirectory: string = '/opt/hiero/block-node/logs';
      if (!(await container.hasDir(blockNodeLogsDirectory))) {
        this.logger.info(`Block node logs directory not found for ${podName}: ${blockNodeLogsDirectory}`);
        return;
      }

      const directoryEntries: TDirectoryData[] = await container.listDir(blockNodeLogsDirectory);
      const logFiles: TDirectoryData[] = directoryEntries.filter(
        (entry: TDirectoryData): boolean => !entry.directory && entry.name.endsWith('.log'),
      );

      if (logFiles.length === 0) {
        this.logger.info(`No block node .log files found for ${podName} in ${blockNodeLogsDirectory}`);
        return;
      }

      for (const logFile of logFiles) {
        await container.copyFrom(`${blockNodeLogsDirectory}/${logFile.name}`, blockNodeLogDirectory);
      }
    } catch (error) {
      this.logger.error(`Failed to download block node log files from ${podName}: ${error}`);
    }
  }

  public downloadJavaFlightRecorderLogs(): SoloListrTask<NodeCollectJfrLogsContext> {
    return {
      title: 'Download Java Flight Recorder logs from node pod',
      task: async (
        context_: NodeCollectJfrLogsContext,
        task: SoloListrTaskWrapper<NodeCollectJfrLogsContext>,
      ): Promise<void> => {
        this.logger.info(`Downloading Java Flight Recorder logs from node ${context_.config.nodeAlias}...`);
        const config: NodeCollectJfrLogsConfigClass = context_.config;
        const nodeFullyQualifiedPodName: PodName = Templates.renderNetworkPodName(config.nodeAlias);
        const podReference: PodReference = PodReference.of(config.namespace, nodeFullyQualifiedPodName);
        const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const context: Context = extractContextFromConsensusNodes(config.nodeAlias, config.consensusNodes);

        const k8Container: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);
        let pid: string;
        try {
          const result: string = await k8Container.execContainer('ps axww -o pid,command');
          const resultLines: string[] = result.split('\n');
          const servicesMainProcess: string = resultLines.find((line: string): boolean =>
            line.includes('com.hedera.node.app.ServicesMain'),
          );
          pid = servicesMainProcess.trim().split(' ', 1)[0];
        } catch (error) {
          throw new SoloErrors.component.nodeJfrExecutionFailed(
            'Failed to get process list',
            nodeFullyQualifiedPodName.toString(),
            error,
          );
        }

        if (!pid) {
          throw new SoloErrors.component.nodeJfrPidNotFound(nodeFullyQualifiedPodName.toString());
        }

        const recordingFilePath: string = `${HEDERA_HAPI_PATH}/output/recording.jfr`;
        let dumpResult: string;
        try {
          dumpResult = await k8Container.execContainer(`jcmd ${pid} JFR.dump name=1 filename=${recordingFilePath}`);
          this.logger.info(`JFR dump command output: ${dumpResult}`);
        } catch (error) {
          throw new SoloErrors.component.nodeJfrExecutionFailed(
            'Failed to create JFR recording',
            nodeFullyQualifiedPodName.toString(),
            error,
          );
        }

        // jcmd exits 0 even when no JFR recording is active and just prints an
        // informational message. Detect that case and skip the task gracefully
        // rather than failing the subsequent copy — performance-test runs
        // without JFR enabled should not fail at teardown.
        const jfrNotEnabledPattern: RegExp = /Could not find any recording|No recording (?:with|named)|No recordings/i;
        if (jfrNotEnabledPattern.test(dumpResult)) {
          const reason: string = `Java Flight Recorder is not enabled on node pod ${nodeFullyQualifiedPodName}`;
          this.logger.warn(reason);
          task.skip(`${task.title} ${chalk.yellow('[SKIPPING]')} ${chalk.grey(reason)}`);
          return;
        }

        try {
          const localJfrLogsDirectory: string = PathEx.join(constants.SOLO_LOGS_DIR, config.deployment);
          fs.mkdirSync(localJfrLogsDirectory, {recursive: true});
          await k8Container.copyFrom(recordingFilePath, localJfrLogsDirectory);
          const targetPath: string = PathEx.joinWithRealPath(localJfrLogsDirectory, 'recording.jfr');
          fs.renameSync(PathEx.joinWithRealPath(localJfrLogsDirectory, 'recording.jfr'), targetPath);
          this.logger.showUser(`Downloaded Java Flight Recorder logs to ${targetPath}`);
        } catch (error) {
          throw new SoloErrors.component.nodeJfrExecutionFailed(
            'Failed to copy JFR recording',
            nodeFullyQualifiedPodName.toString(),
            error,
          );
        }
      },
    };
  }
}
