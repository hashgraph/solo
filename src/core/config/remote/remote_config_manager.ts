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
import * as constants from '../../constants.js';
import {MissingArgumentError, SoloError} from '../../errors.js';
import {RemoteConfigDataWrapper} from './remote_config_data_wrapper.js';
import chalk from 'chalk';
import {RemoteConfigMetadata} from './metadata.js';
import {Flags as flags} from '../../../commands/flags.js';
import * as yaml from 'yaml';
import {ComponentsDataWrapper} from './components_data_wrapper.js';
import {RemoteConfigValidator} from './remote_config_validator.js';
import {K8} from '../../k8.js';
import type {Cluster, Context, Namespace} from './types.js';
import {SoloLogger} from '../../logging.js';
import {ConfigManager} from '../../config_manager.js';
import {LocalConfig} from '../local_config.js';
import type {DeploymentStructure} from '../local_config_data.js';
import {type ContextClusterStructure} from '../../../types/config_types.js';
import {type EmptyContextConfig, type Optional, type SoloListrTask} from '../../../types/index.js';
import type * as k8s from '@kubernetes/client-node';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../container_helper.js';
import {ErrorMessages} from '../../error_messages.js';

interface ListrContext {
  config: {contextCluster: ContextClusterStructure};
}

/**
 * Uses Kubernetes ConfigMaps to manage the remote configuration data by creating, loading, modifying,
 * and saving the configuration data to and from a Kubernetes cluster.
 */
@injectable()
export class RemoteConfigManager {
  /** Stores the loaded remote configuration data. */
  private remoteConfig: Optional<RemoteConfigDataWrapper>;

  /**
   * @param k8 - The Kubernetes client used for interacting with ConfigMaps.
   * @param logger - The logger for recording activity and errors.
   * @param localConfig - Local configuration for the remote config.
   * @param configManager - Manager to retrieve application flags and settings.
   */
  public constructor(
    @inject(K8) private readonly k8?: K8,
    @inject(SoloLogger) private readonly logger?: SoloLogger,
    @inject(LocalConfig) private readonly localConfig?: LocalConfig,
    @inject(ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this.k8 = patchInject(k8, K8, this.constructor.name);
    this.logger = patchInject(logger, SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, LocalConfig, this.constructor.name);
    this.configManager = patchInject(configManager, ConfigManager, this.constructor.name);
  }

  /* ---------- Getters ---------- */

  public get currentCluster(): Cluster {
    return this.localConfig.currentDeploymentName as Cluster;
  }

  /** @returns the components data wrapper cloned */
  public get components(): ComponentsDataWrapper {
    return this.remoteConfig.components.clone();
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
  private async create(): Promise<void> {
    const clusters: Record<Cluster, Namespace> = {};

    Object.entries(this.localConfig.deployments).forEach(
      ([namespace, deployment]: [Namespace, DeploymentStructure]) => {
        deployment.clusters.forEach(cluster => (clusters[cluster] = namespace));
      },
    );

    this.remoteConfig = new RemoteConfigDataWrapper({
      metadata: new RemoteConfigMetadata(this.getNamespace(), new Date(), this.localConfig.userEmailAddress),
      clusters,
      components: ComponentsDataWrapper.initializeEmpty(),
      lastExecutedCommand: 'deployment create',
      commandHistory: ['deployment create'],
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

    const configMap = await this.getConfigMap();
    if (!configMap) return false;

    this.remoteConfig = RemoteConfigDataWrapper.fromConfigmap(configMap);

    return true;
  }

  /**
   * Loads the remote configuration, performs a validation and returns it
   * @returns RemoteConfigDataWrapper
   */
  public async get(): Promise<RemoteConfigDataWrapper> {
    await this.load();
    try {
      await RemoteConfigValidator.validateComponents(this.remoteConfig.components, this.k8);
    } catch (e) {
      throw new SoloError(ErrorMessages.REMOTE_CONFIG_IS_INVALID(this.k8.getCurrentClusterName()));
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
  public async loadAndValidate(argv: {_: string[]}) {
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

    await RemoteConfigValidator.validateComponents(self.remoteConfig.components, self.k8);

    const currentCommand = argv._.join(' ');
    self.remoteConfig!.addCommandToHistory(currentCommand);

    await self.save();
  }

  public async createAndValidate(cluster: Cluster, context: Context, namespace: Namespace) {
    const self = this;
    self.k8.setCurrentContext(context);

    if (!(await self.k8.hasNamespace(namespace))) {
      await self.k8.createNamespace(namespace);
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

    await self.create();
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
      return await this.k8.getNamespacedConfigMap(constants.SOLO_REMOTE_CONFIGMAP_NAME);
    } catch (error: any) {
      if (error.meta?.statusCode !== StatusCodes.NOT_FOUND) {
        throw new SoloError('Failed to read remote config from cluster', error);
      }

      return null;
    }
  }

  /**
   * Creates a new ConfigMap entry in the Kubernetes cluster with the remote configuration data.
   */
  private async createConfigMap(): Promise<void> {
    await this.k8.createNamespacedConfigMap(
      constants.SOLO_REMOTE_CONFIGMAP_NAME,
      constants.SOLO_REMOTE_CONFIGMAP_LABELS,
      {'remote-config-data': yaml.stringify(this.remoteConfig.toObject())},
    );
  }

  /** Replaces an existing ConfigMap in the Kubernetes cluster with the current remote configuration data. */
  private async replaceConfigMap(): Promise<void> {
    await this.k8.replaceNamespacedConfigMap(
      constants.SOLO_REMOTE_CONFIGMAP_NAME,
      constants.SOLO_REMOTE_CONFIGMAP_LABELS,
      {'remote-config-data': yaml.stringify(this.remoteConfig.toObject() as any)},
    );
  }

  private setDefaultNamespaceIfNotSet(): void {
    if (this.configManager.hasFlag(flags.namespace)) return;

    if (!this.localConfig?.currentDeploymentName) {
      this.logger.error('Current deployment name is not set in local config', this.localConfig);
      throw new SoloError('Current deployment name is not set in local config');
    }

    // TODO: Current quick fix for commands where namespace is not passed
    const namespace = this.localConfig.currentDeploymentName.replace(/^kind-/, '');

    this.configManager.setFlag(flags.namespace, namespace);
  }

  private setDefaultContextIfNotSet(): void {
    if (this.configManager.hasFlag(flags.context)) return;

    const context = this.k8.getCurrentContext();

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
  private getNamespace(): string {
    const ns = this.configManager.getFlag<string>(flags.namespace) as string;
    if (!ns) throw new MissingArgumentError('namespace is not set');
    return ns;
  }
}
