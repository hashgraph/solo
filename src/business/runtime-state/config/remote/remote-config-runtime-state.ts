// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../../core/errors/solo-errors.js';
import {type SoloError} from '../../../../core/errors/solo-error.js';
import {inject, injectable} from 'tsyringe-neo';
import {type ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {RemoteConfigSource} from '../../../../data/configuration/impl/remote-config-source.js';
import {YamlConfigMapStorageBackend} from '../../../../data/backend/impl/yaml-config-map-storage-backend.js';
import {type ConfigMap} from '../../../../integration/kube/resources/config-map/config-map.js';
import {LedgerPhase} from '../../../../data/schema/model/remote/ledger-phase.js';
import {ComponentsDataWrapperApi} from '../../../../core/config/remote/api/components-data-wrapper-api.js';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../integration/kube/k8-factory.js';
import {type SoloLogger} from '../../../../core/logging/solo-logger.js';
import {type ConfigManager} from '../../../../core/config-manager.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type Context,
  type DeploymentName,
  type NamespaceNameAsString,
  Optional,
} from '../../../../types/index.js';
import {
  type AnyObject,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
} from '../../../../types/aliases.js';
import {NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {ComponentStateMetadataSchema} from '../../../../data/schema/model/remote/state/component-state-metadata-schema.js';
import {Templates} from '../../../../core/templates.js';
import {DeploymentPhase, DEPLOYMENT_PHASE_ORDER} from '../../../../data/schema/model/remote/deployment-phase.js';
import {getSoloVersion} from '../../../../../version.js';
import * as constants from '../../../../core/constants.js';
import {Flags as flags} from '../../../../commands/flags.js';
import {promptTheUserForDeployment} from '../../../../core/resolvers.js';
import {ConsensusNode} from '../../../../core/model/consensus-node.js';
import {RemoteConfigRuntimeStateApi} from '../../api/remote-config-runtime-state-api.js';
import {type RemoteConfigValidatorApi} from '../../../../core/config/remote/api/remote-config-validator-api.js';
import {ComponentFactoryApi} from '../../../../core/config/remote/api/component-factory-api.js';
import {ComponentTypes} from '../../../../core/config/remote/enumerations/component-types.js';
import {LocalConfigRuntimeState} from '../local/local-config-runtime-state.js';
import {RemoteConfigMetadataSchema} from '../../../../data/schema/model/remote/remote-config-metadata-schema.js';
import {ApplicationVersionsSchema} from '../../../../data/schema/model/common/application-versions-schema.js';
import {ClusterSchema} from '../../../../data/schema/model/common/cluster-schema.js';
import {DeploymentStateSchema} from '../../../../data/schema/model/remote/deployment-state-schema.js';
import {DeploymentHistorySchema} from '../../../../data/schema/model/remote/deployment-history-schema.js';
import {RemoteConfigSchemaDefinition} from '../../../../data/schema/migration/impl/remote/remote-config-schema-definition.js';
import {RemoteConfigSchema} from '../../../../data/schema/model/remote/remote-config-schema.js';
import {ConsensusNodeStateSchema} from '../../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {UserIdentitySchema} from '../../../../data/schema/model/common/user-identity-schema.js';
import {Deployment} from '../local/deployment.js';
import {RemoteConfig} from './remote-config.js';
import {ComponentIdsSchema} from '../../../../data/schema/model/remote/state/component-ids-schema.js';
import {type BaseStateSchema} from '../../../../data/schema/model/remote/state/base-state-schema.js';
import {Helpers} from '../../../../core/helpers.js';
import {Duration} from '../../../../core/time/duration.js';
import {type ContainerEngineClient} from '../../../../integration/container-engine/container-engine-client.js';
import {ClusterNodeResumeOutcome} from '../../../../integration/container-engine/cluster-node-resume-outcome.js';
import {ResourceNotFoundError} from '../../../../integration/kube/errors/resource-operation-errors.js';
import {MissingRequiredParametersError} from '../../errors/missing-required-parameters-error.js';
import {SemanticVersion} from '../../../utils/semantic-version.js';

enum RuntimeStatePhase {
  Loaded = 'loaded',
  NotLoaded = 'not_loaded',
}

interface VersionField {
  value: SemanticVersion<string>;
}

@injectable()
export class RemoteConfigRuntimeState implements RemoteConfigRuntimeStateApi {
  private static readonly SOLO_REMOTE_CONFIGMAP_DATA_KEY: string = 'remote-config-data';

  /** How long to wait for a resumed kind cluster's API: 30 attempts every 2 seconds, so at most a minute. */
  private static readonly KIND_RESUME_MAX_ATTEMPTS: number = 30;
  private static readonly KIND_RESUME_RETRY_INTERVAL: Duration = Duration.ofSeconds(2);

  private phase: RuntimeStatePhase = RuntimeStatePhase.NotLoaded;

  public clusterReferences: Map<Context, ClusterReferenceName> = new Map();
  private namespace: NamespaceName;

  private source?: RemoteConfigSource;
  private backend?: YamlConfigMapStorageBackend;

  private _remoteConfig?: RemoteConfig;

  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.RemoteConfigValidator) private readonly remoteConfigValidator?: RemoteConfigValidatorApi,
    @inject(InjectTokens.ObjectMapper) private readonly objectMapper?: ObjectMapper,
    @inject(InjectTokens.ContainerEngineClient) private readonly containerEngine?: ContainerEngineClient,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfigValidator = patchInject(
      remoteConfigValidator,
      InjectTokens.RemoteConfigValidator,
      this.constructor.name,
    );
    this.objectMapper = patchInject(objectMapper, InjectTokens.ObjectMapper, this.constructor.name);
    this.containerEngine = patchInject(containerEngine, InjectTokens.ContainerEngineClient, this.constructor.name);
  }

  public get configuration(): RemoteConfig {
    this.failIfNotLoaded();
    return this._remoteConfig;
  }

  public get components(): Readonly<ComponentsDataWrapperApi> {
    this.failIfNotLoaded();
    return this._remoteConfig.components;
  }

  public get currentCluster(): ClusterReferenceName {
    return this.k8Factory.default().clusters().readCurrent();
  }

  public async load(namespace?: NamespaceName, context?: Context): Promise<void> {
    if (this.isLoaded()) {
      return;
    }

    await this.populateFromExisting(namespace, context);
  }

  private async populateFromConfigMap(configMap: ConfigMap, remoteConfig?: RemoteConfigSchema): Promise<void> {
    this.backend = new YamlConfigMapStorageBackend(configMap);

    this.source = new RemoteConfigSource(
      new RemoteConfigSchemaDefinition(this.objectMapper),
      this.objectMapper,
      this.backend,
    );

    await this.source.load();

    if (remoteConfig) {
      this.source.setModelData(remoteConfig);
    }

    this._remoteConfig = new RemoteConfig(this.source.modelData);
    this.phase = RuntimeStatePhase.Loaded;
  }

  private async updateConfigMap(
    context: Context,
    namespace: NamespaceName,
    data: Record<string, string>,
  ): Promise<void> {
    await this.k8Factory.getK8(context).configMaps().update(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME, data);
  }

  public isLoaded(): boolean {
    return this.phase === RuntimeStatePhase.Loaded;
  }

  private failIfNotLoaded(): void {
    if (!this.isLoaded()) {
      throw new SoloErrors.internal.readRemoteConfigBeforeLoad();
    }
  }

  public async persist(): Promise<void> {
    if (!this.isLoaded()) {
      throw new SoloErrors.internal.writeRemoteConfigBeforeLoad();
    }

    await this.source.persist();
    const remoteConfigDataBytes: Buffer = await this.backend.readBytes(
      RemoteConfigRuntimeState.SOLO_REMOTE_CONFIGMAP_DATA_KEY,
    );

    const remoteConfigData: Record<string, string> = {
      [RemoteConfigRuntimeState.SOLO_REMOTE_CONFIGMAP_DATA_KEY]: remoteConfigDataBytes.toString('utf8'),
    };

    const promises: Promise<void>[] = [];

    for (const context of this.clusterReferences.keys()) {
      promises.push(this.updateConfigMap(context, this.namespace, remoteConfigData));
    }

    await Promise.all(promises);
  }

  public async create(
    argv: ArgvStruct,
    ledgerPhase: LedgerPhase,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deploymentName: DeploymentName,
    clusterReference: ClusterReferenceName,
    context: Context,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void> {
    this.populateClusterReferences(deploymentName);

    const consensusNodeStates: ConsensusNodeStateSchema[] = nodeAliases.map(
      (nodeAlias: NodeAlias): ConsensusNodeStateSchema => {
        return new ConsensusNodeStateSchema(
          new ComponentStateMetadataSchema(
            Templates.renderComponentIdFromNodeAlias(nodeAlias),
            namespace.name,
            clusterReference,
            DeploymentPhase.REQUESTED,
          ),
        );
      },
    );

    const userIdentity: Readonly<UserIdentitySchema> = this.localConfig.configuration.userIdentity;
    const cliVersion: SemanticVersion<string> = new SemanticVersion<string>(getSoloVersion());
    const command: string = argv._.join(' ');

    const cluster: ClusterSchema = new ClusterSchema(
      clusterReference,
      namespace.name,
      deploymentName,
      dnsBaseDomain,
      dnsConsensusNodePattern,
    );

    const remoteConfig: RemoteConfigSchema = new RemoteConfigSchema(
      RemoteConfigSchema.SCHEMA_VERSION.major,
      new RemoteConfigMetadataSchema(new Date(), userIdentity),
      new ApplicationVersionsSchema(cliVersion),
      [cluster],
      new DeploymentStateSchema(ledgerPhase, new ComponentIdsSchema(nodeAliases.length + 1), consensusNodeStates),
      new DeploymentHistorySchema([command], command),
    );

    const configMap: ConfigMap = await this.createConfigMap(namespace, context);
    await this.populateFromConfigMap(configMap, remoteConfig);

    await this.persist();
  }

  public async createFromExisting(
    namespace: NamespaceName,
    clusterReference: ClusterReferenceName,
    deploymentName: DeploymentName,
    componentFactory: ComponentFactoryApi,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
    existingClusterContext: Context,
    argv: ArgvStruct,
    nodeAliases: NodeAliases,
  ): Promise<void> {
    await this.populateFromExisting(namespace, existingClusterContext);

    this.populateClusterReferences(deploymentName);

    const newClusterContext: Context = this.localConfig.configuration.clusterRefs
      .get(clusterReference.toString())
      ?.toString();

    //? Create copy of the existing remote config inside the new cluster
    await this.createConfigMap(namespace, newClusterContext);
    await this.persist();

    //* update the command history
    this.addCommandToHistory(argv._.join(' '));

    //* add the new clusters
    this.configuration.addCluster(
      new ClusterSchema(clusterReference, namespace.name, deploymentName, dnsBaseDomain, dnsConsensusNodePattern),
    );

    //* add the new nodes to components
    for (const nodeAlias of nodeAliases) {
      const consensusNodeComponent: ConsensusNodeStateSchema = componentFactory.createNewConsensusNodeComponent(
        Templates.renderComponentIdFromNodeAlias(nodeAlias),
        clusterReference,
        namespace,
        DeploymentPhase.REQUESTED,
      );

      const consensusNodeAdded: boolean = this.configuration.components.addNewComponent(
        consensusNodeComponent,
        ComponentTypes.ConsensusNode,
      );

      if (!consensusNodeAdded) {
        this.logger.info(
          `Consensus node with id: ${consensusNodeComponent.metadata.id} already exists, skipping creation`,
        );
      }
    }

    await this.persist();
  }

  public addCommandToHistory(command: string): void {
    this.source.modelData.history.commands.push(command);
    this.source.modelData.history.lastExecutedCommand = command;

    if (this.source.modelData.history.commands.length > constants.SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY) {
      this.source.modelData.history.commands.shift();
    }
  }

  public async createConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap> {
    const name: string = constants.SOLO_REMOTE_CONFIGMAP_NAME;
    const labels: Record<string, string> = constants.SOLO_REMOTE_CONFIGMAP_LABELS;
    await this.k8Factory
      .getK8(context)
      .configMaps()
      .create(namespace, name, labels, {[RemoteConfigRuntimeState.SOLO_REMOTE_CONFIGMAP_DATA_KEY]: '{}'});
    return await this.k8Factory.getK8(context).configMaps().read(namespace, name);
  }

  private async getConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap> {
    if (!namespace || !context) {
      throw new MissingRequiredParametersError(
        `Namespace and context are required to get the remote config ConfigMap, received namespace: ${namespace}, context: ${context}`,
      );
    }

    let configMap: ConfigMap;
    try {
      configMap = await this.readRemoteConfigMap(namespace, context);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        throw error;
      }

      // A kind cluster runs on this machine, so a failure there is a local problem rather than a cluster solo
      // cannot reach — and the usual local problem is a node container that is simply stopped. Detection
      // follows the `kind-<cluster-name>` names kind writes into the kubeconfig, including renamed contexts.
      // Either way the original failure is kept as the cause so the real reason (context down, RBAC denial,
      // API error) reaches the error output and the logs.
      const kindClusterName: string | undefined = Helpers.kindClusterNameForContext(context, this.k8Factory);
      if (kindClusterName === undefined) {
        throw new SoloErrors.system.clusterUnreachable(context, error);
      }

      configMap = await this.resumeKindClusterAndRead(namespace, kindClusterName, context, error);
    }
    if (!configMap) {
      throw new SoloErrors.system.resourceNotFound(
        `remote config ConfigMap for namespace: ${namespace}, context: ${context}`,
      );
    }

    return configMap;
  }

  private async readRemoteConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap> {
    return await this.k8Factory.getK8(context).configMaps().read(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);
  }

  /**
   * Recovers a kind cluster whose node container was left stopped — by a reboot or a manual stop — and reads
   * the remote config ConfigMap again once its Kubernetes API answers.
   *
   * Only a container that solo actually started is waited on: when there was nothing to resume the original
   * failure is reported unchanged, so this never turns an unrelated API failure into a long wait.
   *
   * @param namespace - the namespace holding the remote config ConfigMap.
   * @param clusterName - the kind cluster name the failed context targets.
   * @param context - the kind kubeconfig context the read failed against.
   * @param cause - the failure that triggered the recovery attempt.
   */
  private async resumeKindClusterAndRead(
    namespace: NamespaceName,
    clusterName: string,
    context: Context,
    cause: Error,
  ): Promise<ConfigMap> {
    const outcome: ClusterNodeResumeOutcome = await this.containerEngine.resumeStoppedClusterNode(clusterName);

    if (outcome === ClusterNodeResumeOutcome.ENGINE_UNAVAILABLE) {
      throw new SoloErrors.system.containerEngineNotRunning(cause);
    }

    if (outcome !== ClusterNodeResumeOutcome.RESUMED) {
      throw new SoloErrors.system.kubernetesApiInvalidResponse(cause);
    }

    this.logger.showUser(
      `The kind cluster '${clusterName}' was stopped; solo started its node container and is waiting for the Kubernetes API...`,
    );

    let lastError: Error = cause;

    for (let attempt: number = 0; attempt < RemoteConfigRuntimeState.KIND_RESUME_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await Helpers.sleep(RemoteConfigRuntimeState.KIND_RESUME_RETRY_INTERVAL);
      }

      try {
        const configMap: ConfigMap = await this.readRemoteConfigMap(namespace, context);
        this.logger.showUser(`The kind cluster '${clusterName}' is available again.`);
        return configMap;
      } catch (error) {
        // The API is answering again once it can tell us the ConfigMap is missing, so that is a real answer
        // rather than a reason to keep waiting.
        if (error instanceof ResourceNotFoundError) {
          throw error;
        }
        lastError = error;
      }
    }

    throw new SoloErrors.system.kindClusterStopped(clusterName, lastError);
  }

  private static isMissingRemoteConfigError(error: unknown): boolean {
    return error instanceof ResourceNotFoundError || error instanceof SoloErrors.system.resourceNotFound;
  }

  public async populateFromExisting(namespace: NamespaceName, context: Context): Promise<void> {
    const remoteConfigConfigMap: ConfigMap = await this.getConfigMap(namespace, context);
    await this.populateFromConfigMap(remoteConfigConfigMap);
  }

  public async remoteConfigExists(namespace: NamespaceName, context: Context): Promise<boolean> {
    const configMap: ConfigMap = await this.getConfigMap(namespace, context);
    return !!configMap;
  }

  public populateClusterReferences(deploymentName: DeploymentName): Context {
    let deployment: Deployment;
    try {
      deployment = this.localConfig.configuration.deploymentByName(deploymentName);
    } catch {
      // Deployment not in local config — fall back to namespace/context already resolved from remote config scan.
      const namespaceFromConfig: NamespaceName | string = this.configManager.getFlag(flags.namespace);
      if (namespaceFromConfig) {
        this.namespace =
          typeof namespaceFromConfig === 'string' ? NamespaceName.of(namespaceFromConfig) : namespaceFromConfig;
      }
      return this.configManager.getFlag<Context>(flags.context);
    }

    this.namespace = NamespaceName.of(deployment.namespace);

    for (const clusterReference of deployment.clusters) {
      const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference.toString())?.toString();
      this.clusterReferences.set(context, clusterReference.toString());
    }

    return this.localConfig.configuration.clusterRefs.get(deployment.clusters.get(0)?.toString())?.toString();
  }

  /**
   * Performs the loading of the remote configuration.
   * Checks if the configuration is already loaded, otherwise loads and adds the command to history.
   *
   * @param argv - arguments containing command input for historical reference.
   * @param validate - whether to validate the remote configuration.
   * @param [skipConsensusNodesValidation] - whether or not to validate the consensusNodes
   */
  public async loadAndValidate(
    argv: {_: string[]} & AnyObject,
    validate: boolean = true,
    skipConsensusNodesValidation: boolean = true,
  ): Promise<void> {
    await this.setDefaultNamespaceAndDeploymentIfNotSet(argv);
    await this.setDefaultContextIfNotSet();

    // Sync resolved context back to argv so subsequent configManager.update(argv) preserves it.
    argv[flags.context.name] ||= this.configManager.getFlag<Context>(flags.context);

    const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
    const context: Context = this.populateClusterReferences(deploymentName);

    // TODO: Compare configs from clusterReferences
    try {
      await this.load(this.namespace, context);
    } catch (error) {
      if (
        RemoteConfigRuntimeState.isMissingRemoteConfigError(error) &&
        Helpers.isKindContext(context, this.k8Factory)
      ) {
        throw new SoloErrors.config.remoteConfigMissingOnKindCluster(
          deploymentName,
          this.namespace?.name,
          context,
          error instanceof Error ? error : undefined,
        );
      }
      throw error;
    }

    this.logger.info('Remote config loaded');
    if (!validate) {
      return;
    }

    await this.remoteConfigValidator.validateComponents(
      this.namespace,
      skipConsensusNodesValidation,
      this.configuration.state,
    );

    const currentCommand: string = argv._?.join(' ');
    const commandArguments: string = flags.stringifyArgv(argv);

    this.addCommandToHistory(
      `Executed by ${this.localConfig.configuration.userIdentity.name}: ${currentCommand} ${commandArguments}`.trim(),
    );

    this.initializeComponentVersions(argv, this.source.modelData);

    await this.persist();
  }

  private initializeComponentVersions(argv: AnyObject, remoteConfig: RemoteConfigSchema): void {
    const chartVersionArgument: string | undefined = argv[flags.soloChartVersion.name] as string | undefined;
    if (chartVersionArgument) {
      // Explicit CLI flag always wins.
      remoteConfig.versions.chart = new SemanticVersion(chartVersionArgument);
    } else if (!remoteConfig.versions.chart || remoteConfig.versions.chart.equals('0.0.0')) {
      // Only backfill default when the chart version is not initialized yet.
      // Preserve previously recorded chart versions for commands that don't accept chart flags.
      remoteConfig.versions.chart = new SemanticVersion(flags.soloChartVersion.definition.defaultValue as string);
    }

    // set default versions if not set
    const componentTypes: ComponentTypes[] = [
      ComponentTypes.BlockNode,
      ComponentTypes.RelayNodes,
      ComponentTypes.MirrorNode,
      ComponentTypes.Explorer,
      ComponentTypes.ConsensusNode,
    ];

    for (const componentType of componentTypes) {
      const version: SemanticVersion<string> = this.getComponentVersion(componentType);
      if (version.equals('0.0.0')) {
        switch (componentType) {
          case ComponentTypes.BlockNode: {
            this.updateComponentVersion(
              componentType,
              new SemanticVersion<string>(flags.blockNodeChartVersion.definition.defaultValue as string),
            );
            break;
          }
          case ComponentTypes.RelayNodes: {
            this.updateComponentVersion(
              componentType,
              new SemanticVersion<string>(flags.relayReleaseTag.definition.defaultValue as string),
            );
            break;
          }
          case ComponentTypes.MirrorNode: {
            this.updateComponentVersion(
              componentType,
              new SemanticVersion<string>(flags.mirrorNodeVersion.definition.defaultValue as string),
            );
            break;
          }
          case ComponentTypes.Explorer: {
            this.updateComponentVersion(
              componentType,
              new SemanticVersion<string>(flags.explorerVersion.definition.defaultValue as string),
            );
            break;
          }
          case ComponentTypes.ConsensusNode: {
            this.updateComponentVersion(
              componentType,
              new SemanticVersion<string>(flags.consensusNodeVersion.definition.defaultValue as string),
            );
            break;
          }
          default: {
            throw this.unsupportedComponentTypeError(componentType);
          }
        }
      }
    }
  }

  public async deleteComponents(): Promise<void> {
    this._remoteConfig.state.consensusNodes = [];
    this._remoteConfig.state.blockNodes = [];
    this._remoteConfig.state.envoyProxies = [];
    this._remoteConfig.state.haProxies = [];
    this._remoteConfig.state.explorers = [];
    this._remoteConfig.state.mirrorNodes = [];
    this._remoteConfig.state.relayNodes = [];
    await this.persist();
  }

  private async setDefaultNamespaceAndDeploymentIfNotSet(argv: AnyObject): Promise<void> {
    let namespaceFromConfig: NamespaceNameAsString = this.configManager.getFlag(flags.namespace);
    let deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
    const deploymentFromArgv: DeploymentName = argv[flags.deployment.name] as DeploymentName;
    const namespaceFromArgv: NamespaceNameAsString = argv[flags.namespace.name] as NamespaceNameAsString;

    // Keep config manager in sync when deployment/namespace are resolved directly in argv by caller logic.
    if (!deploymentName && deploymentFromArgv) {
      this.configManager.setFlag(flags.deployment, deploymentFromArgv);
      deploymentName = deploymentFromArgv;
    }

    // Keep config manager in sync when namespace is resolved directly in argv by caller logic.
    // argv takes precedence over the default namespace that middleware may have set from kubectl context.
    if (namespaceFromArgv) {
      this.configManager.setFlag(flags.namespace, namespaceFromArgv);
      namespaceFromConfig = namespaceFromArgv;
    }

    if (namespaceFromConfig && deploymentName) {
      return;
    }

    if (!deploymentName) {
      deploymentName = await promptTheUserForDeployment(this.configManager, undefined, this.localConfig);
      // TODO: Fix once we have the DataManager,
      //       without this the user will be prompted a second time for the deployment
      // TODO: we should not be mutating argv
      argv[flags.deployment.name] = deploymentName;
      this.logger.warn(
        `Deployment name not found in flags or local config, setting it in argv and config manager to: ${deploymentName}`,
      );
      this.configManager.setFlag(flags.deployment, deploymentName);
    }

    // TODO: Current quick fix for commands where namespace is not passed
    const currentDeployment: Deployment = this.localConfig.configuration.deploymentByName(deploymentName);

    const namespace: NamespaceNameAsString = currentDeployment.namespace;

    this.logger.warn(`Namespace not found in flags, setting it to: ${namespace}`);
    this.configManager.setFlag(flags.namespace, namespace);
    argv[flags.namespace.name] = namespace;
  }

  private async setDefaultContextIfNotSet(): Promise<void> {
    if (this.configManager.hasFlag(flags.context)) {
      return;
    }

    let context: Context;
    try {
      context = await this.getContextForFirstCluster();
    } catch {
      context = this.k8Factory.default().contexts().readCurrent();
    }

    if (!context) {
      throw new SoloErrors.internal.remoteConfigContextUnavailable();
    }

    this.logger.warn(`Context not found in flags, setting it to: ${context}`);
    this.configManager.setFlag(flags.context, context);
  }

  //* Common Commands

  /**
   * Get the consensus nodes from the remoteConfig and use the localConfig to get the context
   * @returns an array of ConsensusNode objects
   */
  public getConsensusNodes(): ConsensusNode[] {
    if (!this.isLoaded()) {
      throw new SoloErrors.internal.readRemoteConfigBeforeLoad();
    }

    const consensusNodes: ConsensusNode[] = [];

    for (const node of Object.values(this.configuration.state.consensusNodes)) {
      const cluster: ClusterSchema = this.configuration.clusters.find(
        (cluster: ClusterSchema): boolean => cluster.name === node.metadata.cluster,
      );
      const context: Context =
        this.localConfig.configuration.clusterRefs.get(node.metadata.cluster)?.toString() ??
        this.configManager.getFlag(flags.context);
      const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(node.metadata.id);
      const nodeId: NodeId = Templates.renderNodeIdFromComponentId(node.metadata.id);

      consensusNodes.push(
        new ConsensusNode(
          nodeAlias,
          nodeId,
          node.metadata.namespace,
          node.metadata.cluster,
          context,
          cluster.dnsBaseDomain,
          cluster.dnsConsensusNodePattern,
          Templates.renderConsensusNodeFullyQualifiedDomainName(
            nodeAlias,
            nodeId,
            node.metadata.namespace,
            node.metadata.cluster,
            cluster.dnsBaseDomain,
            cluster.dnsConsensusNodePattern,
          ),
          node.blockNodeMap,
          node.externalBlockNodeMap,
        ),
      );
    }

    // return the consensus nodes
    return consensusNodes;
  }

  /**
   * Gets a list of distinct contexts from the consensus nodes.
   * @returns an array of context strings.
   */
  public getContexts(): Context[] {
    return [...new Set(this.getConsensusNodes().map((node): Context => node.context))];
  }

  /**
   * Gets a list of distinct cluster references from the consensus nodes.
   * @returns an object of cluster references.
   */
  public getClusterRefs(): ClusterReferences {
    const nodes: ConsensusNode[] = this.getConsensusNodes();
    const accumulator: ClusterReferences = new Map<string, string>();

    for (const node of nodes) {
      accumulator.set(node.cluster, node.context);
    }

    return accumulator;
  }

  private async getContextForFirstCluster(): Promise<string> {
    const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);

    const clusterReference: ClusterReferenceName =
      this.localConfig.configuration.deploymentByName(deploymentName)?.clusters?.get(0)?.toString() ??
      this.k8Factory.default().clusters().readCurrent();

    const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference)?.toString();

    this.logger.debug(`Using context ${context} for cluster ${clusterReference} for deployment ${deploymentName}`);

    return context;
  }

  public getNamespace(): NamespaceName {
    return NamespaceName.of(this.configuration.clusters?.at(0)?.namespace);
  }

  public extractContextFromConsensusNodes(nodeAlias: NodeAlias): Optional<string> {
    return Helpers.extractContextFromConsensusNodes(nodeAlias, this.getConsensusNodes());
  }

  public updateComponentVersion(type: ComponentTypes, version: SemanticVersion<string>): void {
    const updateVersionCallback: (versionField: VersionField) => void = (versionField: VersionField): void => {
      versionField.value = version;
    };

    this.applyCallbackToVersionField(type, updateVersionCallback);
  }

  /**
   * Method used to map the component type to the specific version field
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToVersionField(
    componentType: ComponentTypes,
    callback: (versionField: VersionField) => void,
  ): void {
    switch (componentType) {
      case ComponentTypes.ConsensusNode: {
        const versionField: VersionField = {value: this.configuration.versions.consensusNode};
        callback(versionField);
        this.configuration.versions.consensusNode = versionField.value;
        break;
      }
      case ComponentTypes.MirrorNode: {
        const versionField: VersionField = {value: this.configuration.versions.mirrorNodeChart};
        callback(versionField);
        this.configuration.versions.mirrorNodeChart = versionField.value;
        break;
      }
      case ComponentTypes.Explorer: {
        const versionField: VersionField = {value: this.configuration.versions.explorerChart};
        callback(versionField);
        this.configuration.versions.explorerChart = versionField.value;
        break;
      }
      case ComponentTypes.RelayNodes: {
        const versionField: VersionField = {value: this.configuration.versions.jsonRpcRelayChart};
        callback(versionField);
        this.configuration.versions.jsonRpcRelayChart = versionField.value;
        break;
      }
      case ComponentTypes.BlockNode: {
        const versionField: VersionField = {value: this.configuration.versions.blockNodeChart};
        callback(versionField);
        this.configuration.versions.blockNodeChart = versionField.value;
        break;
      }
      case ComponentTypes.Cli: {
        const versionField: VersionField = {value: this.configuration.versions.cli};
        callback(versionField);
        this.configuration.versions.cli = versionField.value;
        break;
      }
      case ComponentTypes.Chart: {
        const versionField: VersionField = {value: this.configuration.versions.chart};
        callback(versionField);
        this.configuration.versions.chart = versionField.value;
        break;
      }
      default: {
        throw this.unsupportedComponentTypeError(componentType);
      }
    }
  }

  /** Builds the unsupported-component-type error, reporting the Solo and config schema versions on both sides. */
  private unsupportedComponentTypeError(componentType: ComponentTypes): SoloError {
    return new SoloErrors.internal.remoteConfigUnsupportedComponent(
      componentType,
      this.configuration.versions.cli.toString(),
      getSoloVersion(),
      this.configuration.schemaVersion,
      this.source.schema.latestSupportedVersion.major,
    );
  }

  public getComponentVersion(type: ComponentTypes): SemanticVersion<string> {
    let version: SemanticVersion<string>;

    const getVersionCallback: (versionField: VersionField) => void = (versionField: VersionField): void => {
      version = versionField.value;
    };

    this.applyCallbackToVersionField(type, getVersionCallback);
    return version;
  }

  private static readonly SNAPSHOT_COMPONENT_TYPES: readonly ComponentTypes[] = [
    ComponentTypes.ConsensusNode,
    ComponentTypes.BlockNode,
    ComponentTypes.MirrorNode,
    ComponentTypes.Explorer,
    ComponentTypes.RelayNodes,
  ];

  public getComponentPhasesMap(): Map<ComponentTypes, DeploymentPhase> {
    if (!this.isLoaded()) {
      return new Map();
    }
    const phaseMap: Map<ComponentTypes, DeploymentPhase> = new Map();
    for (const componentType of RemoteConfigRuntimeState.SNAPSHOT_COMPONENT_TYPES) {
      const components: BaseStateSchema[] =
        this.configuration.components.getComponentByType<BaseStateSchema>(componentType);
      if (components.length === 0) {
        continue;
      }
      const phases: DeploymentPhase[] = components
        .map((component: BaseStateSchema): DeploymentPhase | undefined => component.metadata?.phase)
        .filter((phase: DeploymentPhase | undefined): phase is DeploymentPhase => phase !== undefined);
      if (phases.length === 0) {
        continue;
      }
      let minimumPhase: DeploymentPhase = phases[0];
      for (const phase of phases) {
        if (DEPLOYMENT_PHASE_ORDER[phase] < DEPLOYMENT_PHASE_ORDER[minimumPhase]) {
          minimumPhase = phase;
        }
      }
      phaseMap.set(componentType, minimumPhase);
    }
    return phaseMap;
  }
}
