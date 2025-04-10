// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import * as yaml from 'yaml';
import {RemoteConfigMetadata} from './metadata.js';
import {ComponentsDataWrapper} from './components-data-wrapper.js';
import * as constants from '../../constants.js';
import {CommonFlagsDataWrapper} from './common-flags-data-wrapper.js';
import {type ClusterReference, type Version} from './types.js';
import {type ToObject, type Validate} from '../../../types/index.js';
import {type ConfigManager} from '../../config-manager.js';
import {type RemoteConfigData} from './remote-config-data.js';
import {Cluster} from './cluster.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';
import {type RemoteConfigDataStruct} from './interfaces/remote-config-data-struct.js';

export class RemoteConfigDataWrapper implements Validate, ToObject<RemoteConfigDataStruct> {
  private readonly _version: Version = '1.0.0';
  private _metadata: RemoteConfigMetadata;
  private readonly _clusters: Record<ClusterReference, Cluster>;
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

  public get clusters(): Record<ClusterReference, Cluster> {
    return this._clusters;
  }

  public addCluster(cluster: Cluster): void {
    this._clusters[cluster.name] = cluster;
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

  public static fromConfigmap(configManager: ConfigManager, configMap: ConfigMap): RemoteConfigDataWrapper {
    const data: any = yaml.parse(configMap.data['remote-config-data']);

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

    for (const [clusterReference, cluster] of Object.entries(this.clusters)) {
      if (!clusterReference || typeof clusterReference !== 'string') {
        throw new SoloError(`Invalid remote config cluster-ref: ${clusterReference}`);
      }

      if (!cluster) {
        throw new SoloError(`No cluster info is found for cluster-ref: ${clusterReference}`);
      }

      if (!cluster.name || typeof cluster.name !== 'string') {
        throw new SoloError(`Invalid remote config cluster name: ${cluster.name} for cluster-ref: ${clusterReference}`);
      }

      if (!cluster.namespace || typeof cluster.namespace !== 'string') {
        throw new SoloError(
          `Invalid remote config namespace: ${cluster.namespace} for cluster-ref: ${clusterReference}`,
        );
      }
    }
  }

  public toObject(): RemoteConfigDataStruct {
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
