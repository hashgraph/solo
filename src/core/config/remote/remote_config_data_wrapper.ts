/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {SoloError} from '../../errors.js';
import * as yaml from 'yaml';
import {RemoteConfigMetadata} from './metadata.js';
import {ComponentsDataWrapper} from './components_data_wrapper.js';
import * as constants from '../../constants.js';
import {CommonFlagsDataWrapper} from './common_flags_data_wrapper.js';
import {type ClusterRef, type RemoteConfigDataStructure, type Version} from './types.js';
import type * as k8s from '@kubernetes/client-node';
import {type ToObject, type Validate} from '../../../types/index.js';
import {type ConfigManager} from '../../config_manager.js';
import {type RemoteConfigData} from './remote_config_data.js';
import {Cluster} from './cluster.js';

export class RemoteConfigDataWrapper implements Validate, ToObject<RemoteConfigDataStructure> {
  private readonly _version: Version = '1.0.0';
  private _metadata: RemoteConfigMetadata;
  private _clusters: Record<ClusterRef, Cluster>;
  private _components: ComponentsDataWrapper;
  private _commandHistory: string[];
  private _lastExecutedCommand: string;
  private readonly _flags: CommonFlagsDataWrapper;

  public constructor(data: RemoteConfigData) {
    this._metadata = data.metadata;
    this._clusters = Cluster.fromClustersMapObject(data.clusters);
    this._components = data.components;
    this._commandHistory = data.commandHistory;
    this._lastExecutedCommand = data.lastExecutedCommand ?? '';
    this._flags = data.flags;
    this.validate();
  }

  //! -------- Modifiers -------- //

  public addCommandToHistory(command: string): void {
    this._commandHistory.push(command);
    this.lastExecutedCommand = command;

    if (this._commandHistory.length > constants.SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY) {
      this._commandHistory.shift();
    }

    this.validate();
  }

  //! -------- Getters & Setters -------- //

  private get version(): Version {
    return this._version;
  }

  public get metadata(): RemoteConfigMetadata {
    return this._metadata;
  }

  public set metadata(metadata: RemoteConfigMetadata) {
    this._metadata = metadata;
    this.validate();
  }

  public get clusters(): Record<ClusterRef, Cluster> {
    return this._clusters;
  }

  public set clusters(clusters: Record<ClusterRef, Cluster>) {
    this._clusters = clusters;
    this.validate();
  }

  public get components(): ComponentsDataWrapper {
    return this._components;
  }

  public set components(components: ComponentsDataWrapper) {
    this._components = components;
    this.validate();
  }

  public get lastExecutedCommand(): string {
    return this._lastExecutedCommand;
  }

  private set lastExecutedCommand(lastExecutedCommand: string) {
    this._lastExecutedCommand = lastExecutedCommand;
    this.validate();
  }

  public get commandHistory(): string[] {
    return this._commandHistory;
  }

  private set commandHistory(commandHistory: string[]) {
    this._commandHistory = commandHistory;
    this.validate();
  }

  public get flags() {
    return this._flags;
  }

  //! -------- Utilities -------- //

  public static fromConfigmap(configManager: ConfigManager, configMap: k8s.V1ConfigMap): RemoteConfigDataWrapper {
    const data = yaml.parse(configMap.data['remote-config-data']);

    return new RemoteConfigDataWrapper({
      metadata: RemoteConfigMetadata.fromObject(data.metadata),
      components: ComponentsDataWrapper.fromObject(data.components),
      clusters: data.clusters,
      commandHistory: data.commandHistory,
      lastExecutedCommand: data.lastExecutedCommand,
      flags: CommonFlagsDataWrapper.fromObject(configManager, data.flags),
    });
  }

  public validate(): void {
    if (!this._version || typeof this._version !== 'string') {
      throw new SoloError(`Invalid remote config version: ${this._version}`);
    }

    if (!this.metadata || !(this.metadata instanceof RemoteConfigMetadata)) {
      throw new SoloError(`Invalid remote config metadata: ${this.metadata}`);
    }

    if (!this.lastExecutedCommand || typeof this.lastExecutedCommand !== 'string') {
      throw new SoloError(`Invalid remote config last executed command: ${this.lastExecutedCommand}`);
    }

    if (!Array.isArray(this.commandHistory) || this.commandHistory.some(c => typeof c !== 'string')) {
      throw new SoloError(`Invalid remote config command history: ${this.commandHistory}`);
    }

    Object.entries(this.clusters).forEach(([clusterName, cluster]: [ClusterRef, Cluster]): void => {
      if (!clusterName || typeof clusterName !== 'string') {
        throw new SoloError(`Invalid remote config cluster-ref: ${clusterName}`);
      }

      if (!cluster) {
        throw new SoloError(`No cluster info is found for cluster-ref: ${clusterName}`);
      }

      if (!cluster.name || typeof cluster.name !== 'string') {
        throw new SoloError(`Invalid remote config cluster name: ${cluster.name} for cluster-ref: ${clusterName}`);
      }

      if (!cluster.namespace || typeof cluster.namespace !== 'string') {
        throw new SoloError(`Invalid remote config namespace: ${cluster.namespace} for cluster-ref: ${clusterName}`);
      }
    });
  }

  public toObject(): RemoteConfigDataStructure {
    return {
      metadata: this.metadata.toObject(),
      version: this.version,
      clusters: Cluster.toClustersMapObject(this.clusters),
      components: this.components.toObject(),
      commandHistory: this.commandHistory,
      lastExecutedCommand: this.lastExecutedCommand,
      flags: this.flags.toObject(),
    };
  }
}
