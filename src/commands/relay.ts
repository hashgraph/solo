// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../core/errors/solo-errors.js';
import {Listr} from 'listr2';
import {parseNodeAliases, showVersionBanner, sleep} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account-manager.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {
  type AnyListrContext,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import * as Base64 from 'js-base64';
import {
  type ClusterReferenceName,
  type ComponentId,
  type Context,
  type DeploymentName,
  NamespaceNameAsString,
  type Optional,
  type SoloListr,
  type SoloListrTask,
} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {Templates} from '../core/templates.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {Lock} from '../core/lock/lock.js';
import {NodeServiceMapping} from '../types/mappings/node-service-mapping.js';
import {Secret} from '../integration/kube/resources/secret/secret.js';
import {type RelayNodeStateSchema} from '../data/schema/model/remote/state/relay-node-state-schema.js';
import {PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import {Pod} from '../integration/kube/resources/pod/pod.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';
import {HEDERA_JSON_RPC_RELAY_VERSION} from '../../version.js';
import {UpgradeVersionResolver} from '../core/upgrade-version-resolver.js';
import {assertUpgradeVersionNotOlder} from '../core/upgrade-version-guard.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {ImageReference, type ParsedImageReference} from '../business/utils/image-reference.js';
import {Duration} from '../core/time/duration.js';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {optionFromFlag} from './command-helpers.js';
import {HelmChartValues} from '../integration/helm/model/values.js';

interface RelayDestroyConfigClass {
  chartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  releaseName: string;
  isChartInstalled: boolean;
  clusterRef: Optional<ClusterReferenceName>;
  context: Optional<string>;
  id: number;
  isLegacyChartInstalled: boolean;
}

interface RelayDestroyContext {
  config: RelayDestroyConfigClass;
}

interface RelayDeployConfigClass {
  chainId: string;
  chartDirectory: string;
  relayChartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  operatorId: string;
  operatorKey: string;
  relayReleaseTag: string;
  componentImage: string;
  replicaCount: number;
  loadBalancerEnabled: boolean;
  valuesFile: string;
  isChartInstalled: boolean;
  nodeAliases: NodeAliases;
  releaseName: string;
  relayHelmChartValues: HelmChartValues;
  clusterRef: Optional<ClusterReferenceName>;
  domainName: Optional<string>;
  context: Optional<string>;
  newRelayComponent: RelayNodeStateSchema;
  id: ComponentId;
  forcePortForward: Optional<boolean>;
  cacheDir: Optional<string>;
  isLegacyChartInstalled: false;

  // Mirror Node
  mirrorNodeId: ComponentId;
  mirrorNamespace: NamespaceNameAsString;
  mirrorNodeReleaseName: string;
  isMirrorNodeLegacyChartInstalled: boolean;
}

interface RelayDeployContext {
  config: RelayDeployConfigClass;
}

interface RelayUpgradeConfigClass {
  chainId: string;
  chartDirectory: string;
  relayChartDirectory: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  operatorId: string;
  operatorKey: string;
  relayReleaseTag: string;
  componentImage: string;
  replicaCount: number;
  loadBalancerEnabled: boolean;
  valuesFile: string;
  isChartInstalled: boolean;
  nodeAliases: NodeAliases;
  releaseName: string;
  relayHelmChartValues: HelmChartValues;
  clusterRef: Optional<ClusterReferenceName>;
  domainName: Optional<string>;
  context: Optional<string>;
  id: ComponentId;
  forcePortForward: Optional<boolean>;
  cacheDir: Optional<string>;
  isLegacyChartInstalled: boolean;

  // Mirror Node
  mirrorNodeId: ComponentId;
  mirrorNamespace: NamespaceNameAsString;
  mirrorNodeReleaseName: string;
  isMirrorNodeLegacyChartInstalled: boolean;
}

interface RelayUpgradeContext {
  config: RelayUpgradeConfigClass;
}

interface InferredData {
  id: ComponentId;
  nodeAliases: NodeAliases;
  releaseName: string;
  isChartInstalled: boolean;
  isLegacyChartInstalled: boolean;
}

enum RelayCommandType {
  ADD = 'add',
  UPGRADE = 'upgrade',
  DESTROY = 'destroy',
}

@injectable()
export class RelayCommand extends BaseCommand {
  public constructor(@inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager) {
    super();
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
  }

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly UPGRADE_CONFIGS_NAME: string = 'deployConfigs';

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.chainId,
      flags.chartDirectory,
      flags.relayChartDirectory,
      flags.clusterRef,
      flags.nodeAliasesUnparsed,
      flags.operatorId,
      flags.operatorKey,
      flags.quiet,
      // Keep legacy flag visible as a separate deprecated option.
      flags.relayReleaseTag,
      flags.relayVersion,
      flags.componentImage,
      flags.replicaCount,
      flags.loadBalancerEnabled,
      flags.valuesFile,
      flags.domainName,
      flags.forcePortForward,
      flags.externalAddress,
      flags.cacheDir,
      flags.debugMode,

      // Mirror Node
      flags.mirrorNodeId,
      flags.mirrorNamespace,
    ],
  };

  public static readonly UPGRADE_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.chainId,
      flags.chartDirectory,
      flags.relayChartDirectory,
      flags.clusterRef,
      flags.nodeAliasesUnparsed,
      flags.operatorId,
      flags.operatorKey,
      flags.quiet,
      // Keep legacy flag visible as a separate deprecated option.
      flags.relayReleaseTag,
      flags.relayVersion,
      flags.componentImage,
      flags.replicaCount,
      flags.loadBalancerEnabled,
      flags.valuesFile,
      flags.domainName,
      flags.forcePortForward,
      flags.externalAddress,
      flags.cacheDir,
      flags.id,
      flags.debugMode,

      // Mirror Node
      flags.mirrorNodeId,
      flags.mirrorNamespace,
    ],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.deployment,
      flags.chartDirectory,
      flags.clusterRef,
      flags.nodeAliasesUnparsed,
      flags.quiet,
      flags.debugMode,
      flags.id,
    ],
  };

  private async prepareHelmChartValuesForRelay({
    valuesFile,
    nodeAliases,
    chainId,
    relayReleaseTag,
    componentImage,
    replicaCount,
    loadBalancerEnabled,
    operatorId,
    operatorKey,
    namespace,
    domainName,
    context,
    releaseName,
    deployment,
    mirrorNamespace,
    mirrorNodeReleaseName,
  }: RelayDeployConfigClass | RelayUpgradeConfigClass): Promise<HelmChartValues> {
    const mirrorNodeUrl: string = Templates.renderMirrorNodeIngressControllerUrl(mirrorNamespace);
    const mirrorNodeWeb3Url: string = Templates.renderMirrorNodeWeb3ServiceUrl(mirrorNodeReleaseName, mirrorNamespace);

    const chartValues: HelmChartValues = new HelmChartValues()
      .file(constants.RELAY_VALUES_FILE)
      .set('nameOverride', releaseName)
      .set('relay.config.MIRROR_NODE_URL', mirrorNodeUrl)
      .set('relay.config.MIRROR_NODE_URL_WEB3', mirrorNodeWeb3Url)
      .set('ws.config.MIRROR_NODE_URL', mirrorNodeUrl);

    if (chainId) {
      chartValues.set('relay.config.CHAIN_ID', chainId).set('ws.config.CHAIN_ID', chainId);
    }

    if (relayReleaseTag) {
      relayReleaseTag = SemanticVersion.getValidSemanticVersion(relayReleaseTag, false, 'Relay release');

      chartValues.set('relay.image.tag', relayReleaseTag).set('ws.image.tag', relayReleaseTag);
    }

    if (componentImage) {
      const parsedImageReference: ParsedImageReference = ImageReference.parseImageReference(componentImage);

      chartValues
        .set('relay.image.registry', parsedImageReference.registry)
        .set('ws.image.registry', parsedImageReference.registry)
        .set('relay.image.repository', parsedImageReference.repository)
        .set('ws.image.repository', parsedImageReference.repository)
        .set('relay.image.tag', parsedImageReference.tag)
        .set('ws.image.tag', parsedImageReference.tag);

      if (this.isLocalImageAvailableInDocker(componentImage)) {
        chartValues.set('relay.image.pullPolicy', 'Never').set('ws.image.pullPolicy', 'Never');
      }
    }

    if (replicaCount) {
      chartValues.set('relay.replicaCount', replicaCount).set('ws.replicaCount', replicaCount);
    }

    if (loadBalancerEnabled) {
      chartValues.set('relay.service.type', 'LoadBalancer').set('ws.service.type', 'LoadBalancer');
    }

    const operatorIdUsing: string = operatorId || this.accountManager.getOperatorAccountId(deployment).toString();

    chartValues
      .set('relay.config.OPERATOR_ID_MAIN', operatorIdUsing)
      .set('ws.config.OPERATOR_ID_MAIN', operatorIdUsing);

    if (operatorKey) {
      // use user provided operatorKey if available
      chartValues.set('relay.config.OPERATOR_KEY_MAIN', operatorKey).set('ws.config.OPERATOR_KEY_MAIN', operatorKey);
    } else {
      try {
        const secrets: Secret[] = await this.k8Factory
          .getK8(context)
          .secrets()
          .list(namespace, [`solo.hedera.com/account-id=${operatorIdUsing}`]);

        if (secrets.length === 0) {
          this.logger.info(`No k8s secret found for operator account id ${operatorIdUsing}, use default one`);

          chartValues
            .set('relay.config.OPERATOR_KEY_MAIN', constants.OPERATOR_KEY)
            .set('ws.config.OPERATOR_KEY_MAIN', constants.OPERATOR_KEY);
        } else {
          this.logger.info('Using operator key from k8s secret');

          const operatorKeyFromK8: string = Base64.decode(secrets[0].data.privateKey);

          chartValues
            .set('relay.config.OPERATOR_KEY_MAIN', operatorKeyFromK8)
            .set('ws.config.OPERATOR_KEY_MAIN', operatorKeyFromK8);
        }
      } catch (error) {
        throw new SoloErrors.component.relayOperatorKeyRetrievalFailed(error);
      }
    }

    if (!nodeAliases) {
      throw new SoloErrors.validation.missingArgument('Node IDs must be specified');
    }

    const networkJsonString: string = await this.prepareNetworkJsonString(nodeAliases, namespace, deployment);

    chartValues
      .setLiteral('relay.config.HEDERA_NETWORK', networkJsonString)
      .setLiteral('ws.config.HEDERA_NETWORK', networkJsonString);

    if (domainName) {
      chartValues
        .set('relay.ingress.enabled', true)
        .set('relay.ingress.hosts[0].host', domainName)
        .set('relay.ingress.hosts[0].paths[0].path', '/')
        .set('relay.ingress.hosts[0].paths[0].pathType', 'ImplementationSpecific');
    }

    chartValues.filesFromCommaSeparatedInput(valuesFile);

    return chartValues;
  }

  /**
   * created a JSON string to represent the map between the node keys and their ids
   * output example '{"node-1": "0.0.3", "node-2": "0.004"}'
   */
  private async prepareNetworkJsonString(
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
  ): Promise<string> {
    if (!nodeAliases) {
      throw new SoloErrors.validation.missingArgument('Node IDs must be specified');
    }

    const networkIds: Record<string, string> = {};

    const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(nodeAliases, deployment);
    const networkNodeServicesMap: NodeServiceMapping = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deployment,
    );
    for (const nodeAlias of nodeAliases) {
      const haProxyClusterIp: string = networkNodeServicesMap.get(nodeAlias).haProxyClusterIp;
      const haProxyLoadBalancerIp: string | undefined = networkNodeServicesMap.get(nodeAlias).haProxyLoadBalancerIp;
      const haProxyGrpcPort: string | number = networkNodeServicesMap.get(nodeAlias).haProxyGrpcPort;
      // In multi-cluster deployments the relay may run in a different cluster than some consensus nodes.
      // ClusterIP addresses are only routable within their own cluster, so prefer the load balancer IP
      // when one is available and fall back to ClusterIP otherwise.
      const host: string = haProxyLoadBalancerIp || haProxyClusterIp;
      const networkKey: string = `${host}:${haProxyGrpcPort}`;
      networkIds[networkKey] = accountMap.get(nodeAlias);
    }

    return JSON.stringify(networkIds);
  }

  private getReleaseName(): string {
    return this.renderReleaseName(
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.RelayNodes),
    );
  }

  private renderReleaseName(id: ComponentId): string {
    if (typeof id !== 'number') {
      throw new SoloErrors.validation.relayInvalidComponentId(id);
    }
    return `${constants.JSON_RPC_RELAY_RELEASE_NAME}-${id}`;
  }

  private prepareLegacyReleaseName(nodeAliases: NodeAliases = []): string {
    let releaseName: string = constants.JSON_RPC_RELAY_RELEASE_NAME;
    for (const nodeAlias of nodeAliases) {
      releaseName += `-${nodeAlias}`;
    }
    return releaseName;
  }

  private checkChartIsInstalledTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check chart is installed',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        config.isChartInstalled = await this.chartManager.isChartInstalled(
          config.namespace,
          config.releaseName,
          config.context,
        );
      },
    };
  }

  private prepareChartValuesTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Prepare chart values',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        config.relayHelmChartValues = await this.prepareHelmChartValuesForRelay(config);
      },
    };
  }

  private deployJsonRpcRelayTask(commandType: RelayCommandType): SoloListrTask<AnyListrContext> {
    return {
      title: 'Deploy JSON RPC Relay',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        try {
          if (config.componentImage && this.isLocalImageAvailableInDocker(config.componentImage)) {
            await this.kindLoadComponentImage(config.componentImage, config.context);
          }

          await this.chartManager.upgrade(
            config.namespace,
            config.releaseName,
            constants.JSON_RPC_RELAY_CHART,
            config.relayChartDirectory || constants.JSON_RPC_RELAY_CHART,
            config.relayChartDirectory ? '' : config.relayReleaseTag, // pin chart version to match image version
            config.relayHelmChartValues,
            config.context,
            commandType !== RelayCommandType.ADD,
            commandType === RelayCommandType.ADD,
            false,
            Boolean(config.relayChartDirectory),
          );

          showVersionBanner(this.logger, config.releaseName, config.relayReleaseTag);

          // wait for the pod to destroy in case it was an upgrade
          if (commandType === RelayCommandType.UPGRADE) {
            await sleep(Duration.ofSeconds(40));

            // update relay version in remote config after successful upgrade
            this.remoteConfig.updateComponentVersion(
              ComponentTypes.RelayNodes,
              new SemanticVersion<string>(config.relayReleaseTag),
            );

            await this.remoteConfig.persist();
          }

          // Add component to remote config
          else if (commandType === RelayCommandType.ADD) {
            this.remoteConfig.configuration.components.changeComponentPhase(
              (config as RelayDeployConfigClass).newRelayComponent.metadata.id,
              ComponentTypes.RelayNodes,
              DeploymentPhase.DEPLOYED,
            );

            // update relay version in remote config after successful deployment
            this.remoteConfig.updateComponentVersion(
              ComponentTypes.RelayNodes,
              new SemanticVersion<string>(config.relayReleaseTag),
            );

            await this.remoteConfig.persist();
          }
        } catch (error) {
          throw commandType === RelayCommandType.UPGRADE
            ? new SoloErrors.component.relayUpgradeFailed(error)
            : new SoloErrors.component.relayDeployFailed(error);
        }
      },
    };
  }

  private checkRelayIsRunningTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check relay is running',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        try {
          await this.k8Factory
            .getK8(config.context)
            .pods()
            .waitForRunningPhase(
              config.namespace,
              Templates.renderRelayLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
              constants.RELAY_PODS_RUNNING_MAX_ATTEMPTS,
              constants.RELAY_PODS_RUNNING_DELAY,
            );
        } catch (error) {
          throw new SoloErrors.component.relayNotRunning(config.releaseName, error);
        }
        // reset nodeAlias
        this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
      },
    };
  }

  private checkRelayIsReadyTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check relay is ready',
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        try {
          await this.k8Factory
            .getK8(config.context)
            .pods()
            .waitForReadyStatus(
              config.namespace,
              Templates.renderRelayLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
              constants.RELAY_PODS_READY_MAX_ATTEMPTS,
              constants.RELAY_PODS_READY_DELAY,
            );
        } catch (error) {
          throw new SoloErrors.component.relayNotReady(config.releaseName, error);
        }
      },
    };
  }

  private checkLoadBalancerIsAssignedTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check load balancer is assigned',
      skip: ({config}: RelayDeployContext | RelayUpgradeContext): boolean => !config.loadBalancerEnabled,
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        try {
          await this.k8Factory
            .getK8(config.context)
            .services()
            .waitForLoadBalancerAddress(
              config.namespace,
              [`app.kubernetes.io/instance=${config.releaseName}`],
              constants.LOAD_BALANCER_CHECK_MAX_ATTEMPTS,
              Duration.ofSeconds(constants.LOAD_BALANCER_CHECK_DELAY_SECS).toMillis(),
            );
        } catch (error) {
          throw new SoloErrors.system.loadBalancerNotFound(error);
        }
      },
    };
  }

  private enablePortForwardingTask(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Enable port forwarding for relay node',
      skip: ({config}: RelayDeployContext | RelayUpgradeContext): boolean => !config.forcePortForward,
      task: async ({config}: RelayDeployContext | RelayUpgradeContext): Promise<void> => {
        const externalAddress: string = this.configManager.getFlag<string>(flags.externalAddress);
        const pods: Pod[] = await this.k8Factory
          .getK8(config.context)
          .pods()
          .list(
            config.namespace,
            Templates.renderRelayLabels(config.id, config.isLegacyChartInstalled ? config.releaseName : undefined),
          );

        if (pods.length === 0) {
          throw new SoloErrors.system.relayPodNotFound();
        }

        const podReference: PodReference = pods[0].podReference;
        const clusterReference: string = this.getClusterReference();

        // always kill pre-existing port forward process first otherwise after upgrade
        // the old port forward process tied with old relay pod will still be running and cause issues
        await this.remoteConfig.configuration.components.stopPortForwards(
          clusterReference,
          podReference,
          constants.JSON_RPC_RELAY_PORT, // Pod port
          constants.JSON_RPC_RELAY_LOCAL_PORT, // Local port
          this.k8Factory.getK8(config.context),
          this.logger,
          ComponentTypes.RelayNodes,
          'JSON RPC Relay',
        );
        await this.remoteConfig.persist();

        await this.remoteConfig.configuration.components.managePortForward(
          clusterReference,
          podReference,
          constants.JSON_RPC_RELAY_PORT, // Pod port
          constants.JSON_RPC_RELAY_LOCAL_PORT, // Local port
          this.k8Factory.getK8(config.context),
          this.logger,
          ComponentTypes.RelayNodes,
          'JSON RPC Relay',
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

    const tasks: SoloListr<RelayDeployContext> = this.taskList.newTaskList<RelayDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            try {
              await this.localConfig.load();
              await this.loadRemoteConfigOrWarn(argv);
              if (!this.oneShotState.isActive()) {
                lease = await this.leaseManager.create();
              }
              // reset nodeAlias
              this.configManager.setFlag(flags.nodeAliasesUnparsed, '');

              this.configManager.update(argv);

              flags.disablePrompts(RelayCommand.DEPLOY_FLAGS_LIST.optional);

              const allFlags: CommandFlag[] = [
                ...RelayCommand.DEPLOY_FLAGS_LIST.required,
                ...RelayCommand.DEPLOY_FLAGS_LIST.optional,
              ];

              await this.configManager.executePrompt(task, allFlags);

              // prompt if inputs are empty and set it in the context
              const config: RelayDeployConfigClass = this.configManager.getConfig(
                RelayCommand.DEPLOY_CONFIGS_NAME,
                allFlags,
                ['nodeAliases'],
              ) as RelayDeployConfigClass;

              context_.config = config;

              config.isLegacyChartInstalled = false;

              config.namespace = await this.getNamespace(task);

              config.nodeAliases = parseNodeAliases(
                config.nodeAliasesUnparsed,
                this.remoteConfig.getConsensusNodes(),
                this.configManager,
              );

              config.clusterRef = this.getClusterReference();
              config.context = this.getClusterContext(config.clusterRef);
              config.releaseName = this.getReleaseName();

              const nodeIds: NodeId[] = config.nodeAliases.map((nodeAlias: NodeAlias): number =>
                Templates.nodeIdFromNodeAlias(nodeAlias),
              );

              const {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName} = await this.inferMirrorNodeData(
                config.namespace,
                config.context,
              );

              config.mirrorNodeId = mirrorNodeId;
              config.mirrorNamespace = mirrorNamespace;
              config.mirrorNodeReleaseName = mirrorNodeReleaseName;

              config.newRelayComponent = this.componentFactory.createNewRelayComponent(
                config.clusterRef,
                config.namespace,
                nodeIds,
              );

              config.newRelayComponent.metadata.phase = DeploymentPhase.REQUESTED;

              config.id = config.newRelayComponent.metadata.id;

              if (!this.oneShotState.isActive()) {
                return ListrLock.newAcquireLockTask(lease, task);
              }
              return ListrLock.newSkippedLockTask(task);
            } catch (error) {
              throw new SoloErrors.component.relayDeployFailed(error);
            }
          },
        },
        this.addRelayComponent(),
        this.checkChartIsInstalledTask(),
        this.prepareChartValuesTask(),
        this.deployJsonRpcRelayTask(RelayCommandType.ADD),
        this.checkRelayIsRunningTask(),
        this.checkRelayIsReadyTask(),
        this.checkLoadBalancerIsAssignedTask(),
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
      'relay node add',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        // Tasks wrap their own errors with relay context so it also survives nested one-shot runs;
        // avoid stacking a second identical wrapper here.
        throw error instanceof SoloErrors.component.relayDeployFailed
          ? error
          : new SoloErrors.component.relayDeployFailed(error);
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

  public async upgrade(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<RelayUpgradeContext> = this.taskList.newTaskList<RelayUpgradeContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            try {
              await this.localConfig.load();
              await this.remoteConfig.loadAndValidate(argv);
              if (!this.oneShotState.isActive()) {
                lease = await this.leaseManager.create();
              }
              // reset nodeAlias
              this.configManager.setFlag(flags.nodeAliasesUnparsed, '');

              this.configManager.update(argv);

              flags.disablePrompts(RelayCommand.UPGRADE_FLAGS_LIST.optional);

              const allFlags: CommandFlag[] = [
                ...RelayCommand.UPGRADE_FLAGS_LIST.required,
                ...RelayCommand.UPGRADE_FLAGS_LIST.optional,
              ];

              await this.configManager.executePrompt(task, allFlags);

              // prompt if inputs are empty and set it in the context
              const config: RelayUpgradeConfigClass = this.configManager.getConfig(
                RelayCommand.UPGRADE_CONFIGS_NAME,
                allFlags,
                [],
              ) as RelayUpgradeConfigClass;

              context_.config = config;

              config.namespace = await this.getNamespace(task);

              config.nodeAliases = parseNodeAliases(
                config.nodeAliasesUnparsed,
                this.remoteConfig.getConsensusNodes(),
                this.configManager,
              );

              config.clusterRef = this.getClusterReference();
              config.context = this.getClusterContext(config.clusterRef);

              const {id, isLegacyChartInstalled, isChartInstalled, releaseName, nodeAliases} =
                await this.inferRelayData(config.namespace, config.context);

              config.id = id;
              config.isLegacyChartInstalled = isLegacyChartInstalled;
              config.isChartInstalled = isChartInstalled;
              config.releaseName = releaseName;
              config.nodeAliases = nodeAliases;

              const {mirrorNodeId, mirrorNamespace, mirrorNodeReleaseName} = await this.inferMirrorNodeData(
                config.namespace,
                config.context,
              );

              config.mirrorNodeId = mirrorNodeId;
              config.mirrorNamespace = mirrorNamespace;
              config.mirrorNodeReleaseName = mirrorNodeReleaseName;

              const currentRelayVersion: SemanticVersion<string> = this.remoteConfig.getComponentVersion(
                ComponentTypes.RelayNodes,
              );

              config.relayReleaseTag = UpgradeVersionResolver.resolveFromFlags(
                this.configManager,
                [flags.relayVersion, flags.relayReleaseTag],
                config.relayReleaseTag,
                currentRelayVersion,
                HEDERA_JSON_RPC_RELAY_VERSION,
              );

              assertUpgradeVersionNotOlder(
                'Relay',
                config.relayReleaseTag,
                currentRelayVersion,
                optionFromFlag(flags.relayVersion),
              );

              if (!this.oneShotState.isActive()) {
                return ListrLock.newAcquireLockTask(lease, task);
              }
              return ListrLock.newSkippedLockTask(task);
            } catch (error) {
              throw new SoloErrors.component.relayUpgradeFailed(error);
            }
          },
        },
        this.prepareChartValuesTask(),
        this.deployJsonRpcRelayTask(RelayCommandType.UPGRADE),
        this.checkRelayIsRunningTask(),
        this.checkRelayIsReadyTask(),
        this.checkLoadBalancerIsAssignedTask(),
        this.enablePortForwardingTask(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'relay node upgrade',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        // Avoid stacking a second identical wrapper on errors the tasks already wrapped.
        throw error instanceof SoloErrors.component.relayUpgradeFailed
          ? error
          : new SoloErrors.component.relayUpgradeFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
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

    const tasks: SoloListr<RelayDestroyContext> = this.taskList.newTaskList<RelayDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            try {
              await this.localConfig.load();
              await this.remoteConfig.loadAndValidate(argv);
              if (!this.oneShotState.isActive()) {
                lease = await this.leaseManager.create();
              }
              // reset nodeAlias
              this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
              this.configManager.update(argv);

              flags.disablePrompts([flags.clusterRef, flags.id, flags.nodeAliasesUnparsed]);

              const allFlags: CommandFlag[] = [
                ...RelayCommand.DESTROY_FLAGS_LIST.required,
                ...RelayCommand.DESTROY_FLAGS_LIST.optional,
              ];

              await this.configManager.executePrompt(task, allFlags);

              const clusterReference: ClusterReferenceName = this.getClusterReference();
              const context: Context = this.getClusterContext(clusterReference);
              const namespace: NamespaceName = await this.getNamespace(task);

              const {id, isLegacyChartInstalled, isChartInstalled, releaseName, nodeAliases} =
                await this.inferRelayData(namespace, context);

              const config: RelayDestroyConfigClass = {
                chartDirectory: this.configManager.getFlag(flags.chartDirectory),
                namespace,
                nodeAliases,
                clusterRef: clusterReference,
                id,
                isLegacyChartInstalled,
                isChartInstalled,
                releaseName,
                deployment: this.configManager.getFlag<DeploymentName>(flags.deployment),
                context,
              };

              context_.config = config;

              if (!this.oneShotState.isActive()) {
                return ListrLock.newAcquireLockTask(lease, task);
              }
              return ListrLock.newSkippedLockTask(task);
            } catch (error) {
              throw new SoloErrors.component.relayDestroyFailed(error);
            }
          },
        },
        {
          title: 'Destroy JSON RPC Relay',
          task: async ({config}): Promise<void> => {
            await this.chartManager.uninstall(config.namespace, config.releaseName, config.context);

            const destroyedRelays: string[] = await this.chartManager.getInstalledCharts(
              config.namespace,
              config.context,
            );
            if (this.oneShotState.isActive()) {
              this.logger.showListIfNotEmpty('Destroyed Relays', destroyedRelays);
            } else {
              this.logger.showList('Destroyed Relays', destroyedRelays);
            }

            // reset nodeAliasesUnparsed
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        this.disableRelayComponent(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'relay node destroy',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        // Avoid stacking a second identical wrapper on errors the tasks already wrapped.
        throw error instanceof SoloErrors.component.relayDestroyFailed
          ? error
          : new SoloErrors.component.relayDestroyFailed(error);
      } finally {
        if (!this.oneShotState.isActive()) {
          await lease?.release();
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

  /** Adds the relay component to remote config. */
  public addRelayComponent(): SoloListrTask<RelayDeployContext> {
    return {
      title: 'Add relay component in remote config',
      skip: ({config}): boolean =>
        !this.remoteConfig.isLoaded() || config.isChartInstalled || this.oneShotState.isActive(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.addNewComponent(config.newRelayComponent, ComponentTypes.RelayNodes);

        // save relay version in remote config
        this.remoteConfig.updateComponentVersion(
          ComponentTypes.RelayNodes,
          new SemanticVersion<string>(config.relayReleaseTag),
        );

        await this.remoteConfig.persist();
      },
    };
  }

  /** Remove the relay component from remote config. */
  public disableRelayComponent(): SoloListrTask<RelayDestroyContext> {
    return {
      title: 'Remove relay component from remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async ({config}): Promise<void> => {
        this.remoteConfig.configuration.components.removeComponent(config.id, ComponentTypes.RelayNodes);

        await this.remoteConfig.persist();
      },
    };
  }

  public async close(): Promise<void> {} // no-op

  private async checkIfLegacyChartIsInstalled(
    id: ComponentId,
    namespace: NamespaceName,
    context: Context,
    nodeAliases: NodeAliases,
  ): Promise<boolean> {
    return id <= 1
      ? await this.chartManager.isChartInstalled(namespace, this.prepareLegacyReleaseName(nodeAliases), context)
      : false;
  }

  private inferRelayId(): ComponentId {
    const id: ComponentId = this.configManager.getFlag(flags.id);
    if (typeof id === 'number') {
      return id;
    }

    if (this.remoteConfig.configuration.components.state.relayNodes.length === 0) {
      throw new SoloErrors.system.relayNotInRemoteConfig();
    }

    return this.remoteConfig.configuration.components.state.relayNodes[0].metadata.id;
  }

  private async inferRelayData(namespace: NamespaceName, context: Context): Promise<InferredData> {
    const id: ComponentId = this.inferRelayId();

    const nodeAliases: NodeAliases = parseNodeAliases(
      this.configManager.getFlag(flags.nodeAliasesUnparsed),
      this.remoteConfig.getConsensusNodes(),
      this.configManager,
    );

    const isLegacyChartInstalled: boolean = await this.checkIfLegacyChartIsInstalled(
      id,
      namespace,
      context,
      nodeAliases,
    );

    if (isLegacyChartInstalled) {
      return {
        id,
        nodeAliases,
        releaseName: this.prepareLegacyReleaseName(nodeAliases),
        isChartInstalled: true,
        isLegacyChartInstalled,
      };
    }

    const releaseName: string = this.renderReleaseName(id);
    return {
      id,
      nodeAliases,
      releaseName,
      isChartInstalled: await this.chartManager.isChartInstalled(namespace, releaseName, context),
      isLegacyChartInstalled,
    };
  }
}
