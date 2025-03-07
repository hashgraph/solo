/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as constants from '../../constants.js';
import {MissingArgumentError, SoloError} from '../../errors.js';
import {RemoteConfigDataWrapper} from './remote_config_data_wrapper.js';
import chalk from 'chalk';
import {RemoteConfigMetadata} from './metadata.js';
import {Flags as flags} from '../../../commands/flags.js';
import * as yaml from 'yaml';
import {ComponentsDataWrapper} from './components_data_wrapper.js';
import {RemoteConfigValidator} from './remote_config_validator.js';
import {type K8Factory} from '../../kube/k8_factory.js';
import {type ClusterRef, type ClusterRefs, type DeploymentName, type Version} from './types.js';
import {type SoloLogger} from '../../logging.js';
import {type ConfigManager} from '../../config_manager.js';
import {type LocalConfig} from '../local_config.js';
import {type Optional} from '../../../types/index.js';
import type * as k8s from '@kubernetes/client-node';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency_injection/container_helper.js';
import {ErrorMessages} from '../../error_messages.js';
import {CommonFlagsDataWrapper} from './common_flags_data_wrapper.js';
import {type AnyArgv, type AnyObject, type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type NamespaceName} from '../../kube/resources/namespace/namespace_name.js';
import {InjectTokens} from '../../dependency_injection/inject_tokens.js';
import {Cluster} from './cluster.js';
import * as helpers from '../../helpers.js';
import {ConsensusNode} from '../../model/consensus_node.js';
import {Templates} from '../../templates.js';
import {promptTheUserForDeployment, resolveNamespaceFromDeployment} from '../../resolvers.js';
import {type DeploymentStates} from './enumerations.js';

/**
 * Uses Kubernetes ConfigMaps to manage the remote configuration data by creating, loading, modifying,
 * and saving the configuration data to and from a Kubernetes cluster.
 */
@injectable()
export class RemoteConfigManager {
  /** Stores the loaded remote configuration data. */
  private remoteConfig: Optional<RemoteConfigDataWrapper>;

  /**
   * @param k8Factory - The Kubernetes client used for interacting with ConfigMaps.
   * @param logger - The logger for recording activity and errors.
   * @param localConfig - Local configuration for the remote config.
   * @param configManager - Manager to retrieve application flags and settings.
   */
  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.LocalConfig) private readonly localConfig?: LocalConfig,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
  }

  /* ---------- Getters ---------- */

  public get currentCluster(): ClusterRef {
    return this.k8Factory.default().clusters().readCurrent() as ClusterRef;
  }

  /** @returns the components data wrapper cloned */
  public get components(): ComponentsDataWrapper {
    return this.remoteConfig?.components?.clone();
  }

  /**
   * @returns the remote configuration data's clusters cloned
   */
  public get clusters(): Record<ClusterRef, Cluster> {
    return Object.assign({}, this.remoteConfig?.clusters);
  }

  /* ---------- Readers and Modifiers ---------- */

  /**
   * Modifies the loaded remote configuration data using a provided callback function.
   * The callback operates on the configuration data, which is then saved to the cluster.
   *
   * @param callback - an async function that modifies the remote configuration data.
   * @throws if the configuration is not loaded before modification, will throw a SoloError {@link SoloError}
   */
  public async modify(callback: (remoteConfig: RemoteConfigDataWrapper) => Promise<void>): Promise<void> {
    if (!this.remoteConfig) {
      return;

      // TODO see if this should be disabled to make it an optional feature
      // throw new SoloError('Attempting to modify remote config without loading it first')
    }

    await callback(this.remoteConfig);
    await this.save();
  }

  /**
   * Creates a new remote configuration in the Kubernetes cluster.
   * Gathers data from the local configuration and constructs a new ConfigMap
   * entry in the cluster with initial command history and metadata.
   */
  public async create(
    argv: AnyArgv,
    state: DeploymentStates,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
    clusterRef: ClusterRef,
    context: string,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void> {
    const clusters: Record<ClusterRef, Cluster> = {
      [clusterRef]: new Cluster(clusterRef, namespace.name, deployment, dnsBaseDomain, dnsConsensusNodePattern),
    };

    const lastUpdatedAt = new Date();
    const email = this.localConfig.userEmailAddress;
    const soloVersion = helpers.getSoloVersion();
    const currentCommand: string = argv._.join(' ');

    this.remoteConfig = new RemoteConfigDataWrapper({
      clusters,
      metadata: new RemoteConfigMetadata(namespace.name, deployment, state, lastUpdatedAt, email, soloVersion),
      commandHistory: [currentCommand],
      lastExecutedCommand: currentCommand,
      components: ComponentsDataWrapper.initializeWithNodes(nodeAliases, clusterRef, namespace.name),
      flags: await CommonFlagsDataWrapper.initialize(this.configManager, argv),
    });

    await this.createConfigMap(context);
  }

  /**
   * Saves the currently loaded remote configuration data to the Kubernetes cluster.
   * @throws {@link SoloError} if there is no remote configuration data to save.
   */
  private async save(): Promise<void> {
    if (!this.remoteConfig) {
      throw new SoloError('Attempted to save remote config without data');
    }

    await this.replaceConfigMap();
  }

  /**
   * Loads the remote configuration from the Kubernetes cluster if it exists.
   * @param namespace - The namespace to search for the ConfigMap.
   * @param context - The context to use for the Kubernetes client.
   * @returns true if the configuration is loaded successfully.
   */
  private async load(namespace?: NamespaceName, context?: string): Promise<boolean> {
    if (this.remoteConfig) return true;

    try {
      const configMap = await this.getConfigMap(namespace, context);

      if (configMap) {
        this.remoteConfig = RemoteConfigDataWrapper.fromConfigmap(this.configManager, configMap);
        return true;
      }

      return false;
    } catch (e) {
      const newError = new SoloError('Failed to load remote config from cluster', e);
      // TODO: throw newError instead of showUserError()
      this.logger.showUserError(newError);
      return false;
    }
  }

  /**
   * Loads the remote configuration, performs a validation and returns it
   * @returns RemoteConfigDataWrapper
   */
  public async get(context?: string): Promise<RemoteConfigDataWrapper> {
    const namespace = this.configManager.getFlag<NamespaceName>(flags.namespace) ?? (await this.getNamespace());

    await this.load(namespace, context);
    try {
      await RemoteConfigValidator.validateComponents(
        namespace,
        this.remoteConfig.components,
        this.k8Factory,
        this.localConfig,
        false,
      );
    } catch {
      throw new SoloError(
        ErrorMessages.REMOTE_CONFIG_IS_INVALID(this.k8Factory.getK8(context).clusters().readCurrent()),
      );
    }
    return this.remoteConfig;
  }

  public static compare(remoteConfig1: RemoteConfigDataWrapper, remoteConfig2: RemoteConfigDataWrapper): boolean {
    // Compare clusters
    const clusters1 = Object.keys(remoteConfig1.clusters);
    const clusters2 = Object.keys(remoteConfig2.clusters);
    if (clusters1.length !== clusters2.length) return false;

    for (const i in clusters1) {
      if (clusters1[i] !== clusters2[i]) {
        return false;
      }
    }

    return true;
  }

  /* ---------- Listr Task Builders ---------- */

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
  ) {
    const self = this;
    try {
      await self.setDefaultNamespaceAndDeploymentIfNotSet(argv);
      self.setDefaultContextIfNotSet();
    } catch (e) {
      self.logger.showUser(chalk.red(e.message));
      return;
    }

    if (!(await self.load())) {
      const newError = new SoloError('Failed to load remote config');
      // TODO throw newError instead of showUserError()
      self.logger.showUserError(newError);
      return;
    }
    self.logger.info('Remote config loaded');
    if (!validate) {
      return;
    }

    await RemoteConfigValidator.validateComponents(
      this.configManager.getFlag(flags.namespace),
      self.remoteConfig.components,
      self.k8Factory,
      this.localConfig,
      skipConsensusNodesValidation,
    );

    const additionalCommandData = `Executed by ${self.localConfig.userEmailAddress}: `;

    const currentCommand = argv._?.join(' ');
    const commandArguments = flags.stringifyArgv(argv);

    self.remoteConfig!.addCommandToHistory(additionalCommandData + (currentCommand + ' ' + commandArguments).trim());

    self.populateVersionsInMetadata(argv);

    await self.remoteConfig.flags.handleFlags(argv);

    await self.save();
  }

  private populateVersionsInMetadata(argv: AnyObject) {
    const command: string = argv._?.[0];
    const subcommand: string = argv._?.[1];

    const isCommandUsingSoloChartVersionFlag =
      (command === 'network' && subcommand === 'deploy') ||
      (command === 'network' && subcommand === 'refresh') ||
      (command === 'node' && subcommand === 'update') ||
      (command === 'node' && subcommand === 'update-execute') ||
      (command === 'node' && subcommand === 'add') ||
      (command === 'node' && subcommand === 'add-execute') ||
      (command === 'node' && subcommand === 'delete') ||
      (command === 'node' && subcommand === 'delete-execute');

    if (argv[flags.soloChartVersion.name]) {
      this.remoteConfig.metadata.soloChartVersion = argv[flags.soloChartVersion.name] as Version;
    } else if (isCommandUsingSoloChartVersionFlag) {
      this.remoteConfig.metadata.soloChartVersion = flags.soloChartVersion.definition.defaultValue as Version;
    }

    const isCommandUsingReleaseTagVersionFlag =
      (command === 'node' && subcommand !== 'keys' && subcommand !== 'logs' && subcommand !== 'states') ||
      (command === 'network' && subcommand === 'deploy');

    if (argv[flags.releaseTag.name]) {
      this.remoteConfig.metadata.hederaPlatformVersion = argv[flags.releaseTag.name] as Version;
    } else if (isCommandUsingReleaseTagVersionFlag) {
      this.remoteConfig.metadata.hederaPlatformVersion = flags.releaseTag.definition.defaultValue as Version;
    }

    if (argv[flags.mirrorNodeVersion.name]) {
      this.remoteConfig.metadata.hederaMirrorNodeChartVersion = argv[flags.mirrorNodeVersion.name] as Version;
    } else if (command === 'mirror-node' && subcommand === 'deploy') {
      this.remoteConfig.metadata.hederaMirrorNodeChartVersion = flags.mirrorNodeVersion.definition
        .defaultValue as Version;
    }

    if (argv[flags.hederaExplorerVersion.name]) {
      this.remoteConfig.metadata.hederaExplorerChartVersion = argv[flags.hederaExplorerVersion.name] as Version;
    } else if (command === 'explorer' && subcommand === 'deploy') {
      this.remoteConfig.metadata.hederaExplorerChartVersion = flags.hederaExplorerVersion.definition
        .defaultValue as Version;
    }

    if (argv[flags.relayReleaseTag.name]) {
      this.remoteConfig.metadata.hederaJsonRpcRelayChartVersion = argv[flags.relayReleaseTag.name] as Version;
    } else if (command === 'relay' && subcommand === 'deploy') {
      this.remoteConfig.metadata.hederaJsonRpcRelayChartVersion = flags.relayReleaseTag.definition
        .defaultValue as Version;
    }
  }

  /* ---------- Utilities ---------- */

  /** Empties the component data inside the remote config */
  public async deleteComponents(): Promise<void> {
    await this.modify(async remoteConfig => {
      remoteConfig.components = ComponentsDataWrapper.initializeEmpty();
    });
  }

  public isLoaded(): boolean {
    return !!this.remoteConfig;
  }

  /**
   * Retrieves the ConfigMap containing the remote configuration from the Kubernetes cluster.
   *
   * @param namespace - The namespace to search for the ConfigMap.
   * @param context - The context to use for the Kubernetes client.
   * @returns the remote configuration data.
   * @throws if the ConfigMap could not be read and the error is not a 404 status, will throw a SoloError {@link SoloError}
   */
  public async getConfigMap(namespace?: NamespaceName, context?: string): Promise<k8s.V1ConfigMap> {
    if (!namespace) {
      namespace = await this.getNamespace();
    }
    if (!context) {
      context = this.configManager.getFlag(flags.context);
      if (!context) {
        context = this.getContextForFirstCluster();
      }
    }

    try {
      const configMap = await this.k8Factory
        .getK8(context)
        .configMaps()
        .read(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);
      if (!configMap) {
        // TODO throw newError instead of showUserError()
        const newError = new SoloError(
          `Remote config ConfigMap not found for namespace: ${namespace}, context: ${context}`,
        );
        this.logger.showUserError(newError);
      }
      return configMap;
    } catch (e) {
      // TODO throw newError instead of showUserError()
      const newError = new SoloError(
        `Failed to read remote config from cluster for namespace: ${namespace}, context: ${context}`,
        e,
      );
      this.logger.showUserError(newError);
      return null;
    }
  }

  /**
   * Creates a new ConfigMap entry in the Kubernetes cluster with the remote configuration data.
   */
  public async createConfigMap(context?: string): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .configMaps()
      .create(await this.getNamespace(), constants.SOLO_REMOTE_CONFIGMAP_NAME, constants.SOLO_REMOTE_CONFIGMAP_LABELS, {
        'remote-config-data': yaml.stringify(this.remoteConfig.toObject()),
      });
  }

  /** Replaces an existing ConfigMap in the Kubernetes cluster with the current remote configuration data. */
  private async replaceConfigMap(): Promise<void> {
    const contexts = this.getContexts();
    const namespace = await this.getNamespace();

    await Promise.all(
      contexts.map(context => {
        const name = constants.SOLO_REMOTE_CONFIGMAP_NAME;
        const labels = constants.SOLO_REMOTE_CONFIGMAP_LABELS;
        const data = {
          'remote-config-data': yaml.stringify(this.remoteConfig.toObject()),
        };

        return this.k8Factory.getK8(context).configMaps().replace(namespace, name, labels, data);
      }),
    );
  }

  private async setDefaultNamespaceAndDeploymentIfNotSet(argv: AnyObject): Promise<void> {
    if (this.configManager.hasFlag(flags.namespace)) return;

    // TODO: Current quick fix for commands where namespace is not passed
    let deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    let currentDeployment = this.localConfig.deployments[deploymentName];

    if (!deploymentName) {
      deploymentName = await promptTheUserForDeployment(this.configManager);
      currentDeployment = this.localConfig.deployments[deploymentName];
      // TODO: Fix once we have the DataManager,
      //       without this the user will be prompted a second time for the deployment
      // TODO: we should not be mutating argv
      argv[flags.deployment.name] = deploymentName;
      this.logger.warn(
        `Deployment name not found in flags or local config, setting it in argv and config manager to: ${deploymentName}`,
      );
      this.configManager.setFlag(flags.deployment, deploymentName);
    }

    if (!currentDeployment) {
      this.logger.error('Selected deployment name is not set in local config', this.localConfig);
      throw new SoloError(`Selected deployment name is not set in local config - ${deploymentName}`);
    }

    const namespace = currentDeployment.namespace;

    this.logger.warn(`Namespace not found in flags, setting it to: ${namespace}`);
    this.configManager.setFlag(flags.namespace, namespace);
    argv[flags.namespace.name] = namespace;
  }

  private setDefaultContextIfNotSet(): void {
    if (this.configManager.hasFlag(flags.context)) return;

    let context: string = this.getContextForFirstCluster();
    if (!context) {
      context = this.k8Factory.default().contexts().readCurrent();
    }

    if (!context) {
      this.logger.error("Context is not passed and default one can't be acquired", this.localConfig);
      throw new SoloError("Context is not passed and default one can't be acquired");
    }

    this.logger.warn(`Context not found in flags, setting it to: ${context}`);
    this.configManager.setFlag(flags.context, context);
  }

  // cluster will be retrieved from LocalConfig based the context to cluster mapping

  /**
   * Retrieves the namespace value from the configuration manager's flags.
   * @returns string - The namespace value if set.
   */
  private async getNamespace(): Promise<NamespaceName> {
    const ns = await resolveNamespaceFromDeployment(this.localConfig, this.configManager);
    if (!ns) throw new MissingArgumentError('namespace was not found in the deployment within local config');
    return ns;
  }

  //* Common Commands

  /**
   * Get the consensus nodes from the remoteConfigManager and use the localConfig to get the context
   * @returns an array of ConsensusNode objects
   */
  public getConsensusNodes(): ConsensusNode[] {
    const consensusNodes: ConsensusNode[] = [];
    if (!this.isLoaded()) {
      throw new SoloError('Remote configuration is not loaded, and was expected to be loaded');
    }
    const clusters: Record<ClusterRef, Cluster> = this.clusters;

    try {
      if (!this.components?.consensusNodes) return [];
    } catch {
      return [];
    }

    // using the remoteConfigManager to get the consensus nodes
    Object.values(this.components.consensusNodes).forEach(node => {
      this.logger.debug(`Adding consensus node ${node.name} , node.cluster = ${node.cluster}`);
      consensusNodes.push(
        new ConsensusNode(
          node.name as NodeAlias,
          node.nodeId,
          node.namespace,
          node.cluster,
          // use local config to get the context
          this.localConfig.clusterRefs[node.cluster],
          clusters[node.cluster]?.dnsBaseDomain ?? 'cluster.local',
          clusters[node.cluster]?.dnsConsensusNodePattern ?? 'network-{nodeAlias}-svc.{namespace}.svc',
          Templates.renderConsensusNodeFullyQualifiedDomainName(
            node.name as NodeAlias,
            node.nodeId,
            node.namespace,
            node.cluster,
            clusters[node.cluster]?.dnsBaseDomain ?? 'cluster.local',
            clusters[node.cluster]?.dnsConsensusNodePattern ?? 'network-{nodeAlias}-svc.{namespace}.svc',
          ),
        ),
      );
    });

    // return the consensus nodes
    return consensusNodes;
  }

  /**
   * Gets a list of distinct contexts from the consensus nodes.
   * @returns an array of context strings.
   */
  public getContexts(): string[] {
    return [...new Set(this.getConsensusNodes().map(node => node.context))];
  }

  /**
   * Gets a list of distinct cluster references from the consensus nodes.
   * @returns an object of cluster references.
   */
  public getClusterRefs(): ClusterRefs {
    return this.getConsensusNodes().reduce((acc, node) => {
      acc[node.cluster] ||= node.context;
      return acc;
    }, {} as ClusterRefs);
  }

  private getContextForFirstCluster(): string {
    const clusterRefs: ClusterRef[] =
      this.localConfig.deployments[this.configManager.getFlag<DeploymentName>(flags.deployment)].clusters;
    const cluster: string = clusterRefs[0];
    const context: string = this.localConfig.clusterRefs[cluster];
    this.logger.debug(
      `Using context ${context} for cluster ${cluster} for deployment ${this.configManager.getFlag<DeploymentName>(flags.deployment)}`,
    );
    return context;
  }
}
