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
import {type ClusterRef, type Context, type DeploymentName, type NamespaceNameAsString, type Version} from './types.js';
import {type SoloLogger} from '../../logging.js';
import {type ConfigManager} from '../../config_manager.js';
import {type LocalConfig} from '../local_config.js';
import {type DeploymentStructure} from '../local_config_data.js';
import {type Optional} from '../../../types/index.js';
import type * as k8s from '@kubernetes/client-node';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency_injection/container_helper.js';
import {ErrorMessages} from '../../error_messages.js';
import {CommonFlagsDataWrapper} from './common_flags_data_wrapper.js';
import {type AnyObject} from '../../../types/aliases.js';
import {NamespaceName} from '../../kube/resources/namespace/namespace_name.js';
import {ResourceNotFoundError} from '../../kube/errors/resource_operation_errors.js';
import {InjectTokens} from '../../dependency_injection/inject_tokens.js';
import {Cluster} from './cluster.js';
import * as helpers from '../../helpers.js';

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
   * @throws {@link SoloError} if the configuration is not loaded before modification.
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
  private async create(argv: AnyObject): Promise<void> {
    const clusters: Record<ClusterRef, Cluster> = {};

    Object.entries(this.localConfig.deployments).forEach(
      ([deployment, deploymentStructure]: [DeploymentName, DeploymentStructure]) => {
        const namespace = deploymentStructure.namespace.toString();
        deploymentStructure.clusters.forEach(
          cluster => (clusters[cluster] = new Cluster(cluster, namespace, deployment)),
        );
      },
    );

    // temporary workaround until we can have `solo deployment add` command
    const nodeAliases: string[] = helpers.splitFlagInput(this.configManager.getFlag(flags.nodeAliasesUnparsed));

    this.remoteConfig = new RemoteConfigDataWrapper({
      metadata: new RemoteConfigMetadata(
        this.getNamespace().name,
        this.configManager.getFlag<DeploymentName>(flags.deployment),
        new Date(),
        this.localConfig.userEmailAddress,
        helpers.getSoloVersion(),
      ),
      clusters,
      commandHistory: ['deployment create'],
      lastExecutedCommand: 'deployment create',
      components: ComponentsDataWrapper.initializeWithNodes(
        nodeAliases,
        this.configManager.getFlag(flags.deploymentClusters),
        this.getNamespace().name,
      ),
      flags: await CommonFlagsDataWrapper.initialize(this.configManager, argv),
    });

    await this.createConfigMap();
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
   * @returns true if the configuration is loaded successfully.
   */
  private async load(): Promise<boolean> {
    if (this.remoteConfig) return true;

    try {
      const configMap = await this.getConfigMap();

      if (configMap) {
        this.remoteConfig = RemoteConfigDataWrapper.fromConfigmap(this.configManager, configMap);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Loads the remote configuration, performs a validation and returns it
   * @returns RemoteConfigDataWrapper
   */
  public async get(): Promise<RemoteConfigDataWrapper> {
    await this.load();
    try {
      await RemoteConfigValidator.validateComponents(
        this.configManager.getFlag(flags.namespace),
        this.remoteConfig.components,
        this.k8Factory,
        this.localConfig,
      );
    } catch {
      throw new SoloError(ErrorMessages.REMOTE_CONFIG_IS_INVALID(this.k8Factory.default().clusters().readCurrent()));
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
   */
  public async loadAndValidate(argv: {_: string[]} & AnyObject) {
    const self = this;
    try {
      self.setDefaultNamespaceIfNotSet();
      self.setDefaultContextIfNotSet();
    } catch (e) {
      self.logger.showUser(chalk.red(e.message));
      return;
    }

    if (!(await self.load())) {
      self.logger.showUser(chalk.red('remote config not found'));

      // TODO see if this should be disabled to make it an optional feature
      return;
      // throw new SoloError('Failed to load remote config')
    }

    await RemoteConfigValidator.validateComponents(
      this.configManager.getFlag(flags.namespace),
      self.remoteConfig.components,
      self.k8Factory,
      this.localConfig,
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

    if (argv[flags.soloChartVersion.constName]) {
      this.remoteConfig.metadata.soloChartVersion = argv[flags.soloChartVersion.constName] as Version;
    } else if (isCommandUsingSoloChartVersionFlag) {
      this.remoteConfig.metadata.soloChartVersion = flags.soloChartVersion.definition.defaultValue as Version;
    }

    const isCommandUsingReleaseTagVersionFlag =
      (command === 'node' && subcommand !== 'keys' && subcommand !== 'logs' && subcommand !== 'states') ||
      (command === 'network' && subcommand === 'deploy');

    if (argv[flags.releaseTag.constName]) {
      this.remoteConfig.metadata.hederaPlatformVersion = argv[flags.releaseTag.constName] as Version;
    } else if (isCommandUsingReleaseTagVersionFlag) {
      this.remoteConfig.metadata.hederaPlatformVersion = flags.releaseTag.definition.defaultValue as Version;
    }

    if (argv[flags.mirrorNodeVersion.constName]) {
      this.remoteConfig.metadata.hederaMirrorNodeChartVersion = argv[flags.mirrorNodeVersion.constName] as Version;
    } else if (command === 'mirror-node' && subcommand === 'deploy') {
      this.remoteConfig.metadata.hederaMirrorNodeChartVersion = flags.mirrorNodeVersion.definition
        .defaultValue as Version;
    }

    if (argv[flags.hederaExplorerVersion.constName]) {
      this.remoteConfig.metadata.hederaExplorerChartVersion = argv[flags.hederaExplorerVersion.constName] as Version;
    } else if (command === 'explorer' && subcommand === 'deploy') {
      this.remoteConfig.metadata.hederaExplorerChartVersion = flags.hederaExplorerVersion.definition
        .defaultValue as Version;
    }

    if (argv[flags.relayReleaseTag.constName]) {
      this.remoteConfig.metadata.hederaJsonRpcRelayChartVersion = argv[flags.relayReleaseTag.constName] as Version;
    } else if (command === 'relay' && subcommand === 'deploy') {
      this.remoteConfig.metadata.hederaJsonRpcRelayChartVersion = flags.relayReleaseTag.definition
        .defaultValue as Version;
    }
  }

  public async createAndValidate(
    clusterRef: ClusterRef,
    context: Context,
    namespace: NamespaceNameAsString,
    argv: AnyObject,
  ) {
    const self = this;
    self.k8Factory.default().contexts().updateCurrent(context);

    if (!(await self.k8Factory.default().namespaces().has(NamespaceName.of(namespace)))) {
      await self.k8Factory.default().namespaces().create(NamespaceName.of(namespace));
    }

    const localConfigExists = this.localConfig.configFileExists();
    if (!localConfigExists) {
      throw new SoloError("Local config doesn't exist");
    }

    self.unload();
    if (await self.load()) {
      self.logger.showUser(chalk.red('Remote config already exists'));
      throw new SoloError('Remote config already exists');
    }

    await self.create(argv);
  }

  /* ---------- Utilities ---------- */

  /** Empties the component data inside the remote config */
  public async deleteComponents() {
    await this.modify(async remoteConfig => {
      remoteConfig.components = ComponentsDataWrapper.initializeEmpty();
    });
  }

  public isLoaded(): boolean {
    return !!this.remoteConfig;
  }

  public unload() {
    delete this.remoteConfig;
  }

  /**
   * Retrieves the ConfigMap containing the remote configuration from the Kubernetes cluster.
   *
   * @returns the remote configuration data.
   * @throws {@link SoloError} if the ConfigMap could not be read and the error is not a 404 status.
   */
  public async getConfigMap(): Promise<k8s.V1ConfigMap> {
    try {
      return await this.k8Factory
        .default()
        .configMaps()
        .read(this.getNamespace(), constants.SOLO_REMOTE_CONFIGMAP_NAME);
    } catch (error) {
      if (!(error instanceof ResourceNotFoundError)) {
        throw new SoloError('Failed to read remote config from cluster', error);
      }

      return null;
    }
  }

  /**
   * Creates a new ConfigMap entry in the Kubernetes cluster with the remote configuration data.
   */
  private async createConfigMap(): Promise<void> {
    await this.k8Factory
      .default()
      .configMaps()
      .create(this.getNamespace(), constants.SOLO_REMOTE_CONFIGMAP_NAME, constants.SOLO_REMOTE_CONFIGMAP_LABELS, {
        'remote-config-data': yaml.stringify(this.remoteConfig.toObject()),
      });
  }

  /** Replaces an existing ConfigMap in the Kubernetes cluster with the current remote configuration data. */
  private async replaceConfigMap(): Promise<void> {
    await this.k8Factory
      .default()
      .configMaps()
      .replace(this.getNamespace(), constants.SOLO_REMOTE_CONFIGMAP_NAME, constants.SOLO_REMOTE_CONFIGMAP_LABELS, {
        'remote-config-data': yaml.stringify(this.remoteConfig.toObject() as any),
      });
  }

  private setDefaultNamespaceIfNotSet(): void {
    if (this.configManager.hasFlag(flags.namespace)) return;

    // TODO: Current quick fix for commands where namespace is not passed
    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const currentDeployment = this.localConfig.deployments[deploymentName];

    if (!this.localConfig?.deployments[deploymentName]) {
      this.logger.error('Selected deployment name is not set in local config', this.localConfig);
      throw new SoloError('Selected deployment name is not set in local config');
    }

    const namespace = currentDeployment.namespace;

    this.configManager.setFlag(flags.namespace, namespace);
  }

  private setDefaultContextIfNotSet(): void {
    if (this.configManager.hasFlag(flags.context)) return;

    const context = this.k8Factory.default().contexts().readCurrent();

    if (!context) {
      this.logger.error("Context is not passed and default one can't be acquired", this.localConfig);
      throw new SoloError("Context is not passed and default one can't be acquired");
    }

    this.configManager.setFlag(flags.context, context);
  }

  // cluster will be retrieved from LocalConfig based the context to cluster mapping

  /**
   * Retrieves the namespace value from the configuration manager's flags.
   * @returns string - The namespace value if set.
   */
  private getNamespace(): NamespaceName {
    const ns = this.configManager.getFlag<NamespaceName>(flags.namespace);
    if (!ns) throw new MissingArgumentError('namespace is not set');
    return ns;
  }
}
