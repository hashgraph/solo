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
import { SoloError } from '../../errors.js'
import * as version from '../../../../version.js'
import yaml from 'js-yaml'
import { RemoteConfigMetadata } from './metadata.js'
import { ComponentsDataWrapper } from './components_data_wrapper.js'
import * as constants from '../../constants.js'
import type { Cluster, Version, Namespace, RemoteConfigData, RemoteConfigDataStructure } from './types.js'
import type * as k8s from '@kubernetes/client-node'
import type { ToObject, Validate } from '../../../types/index.js'

export class RemoteConfigDataWrapper implements Validate, ToObject<RemoteConfigDataStructure> {
  private readonly _version: Version = version.HEDERA_PLATFORM_VERSION
  private _metadata: RemoteConfigMetadata
  private _clusters: Record<Cluster, Namespace>
  private _components: ComponentsDataWrapper
  private _commandHistory: string[]
  private _lastExecutedCommand: string

  public constructor (data: RemoteConfigData) {
    this._metadata = data.metadata
    this._clusters = data.clusters
    this._components = data.components
    this._commandHistory = data.commandHistory
    this._lastExecutedCommand = data.lastExecutedCommand ?? ''
    this.validate()
  }

  //! -------- Modifiers -------- //

  public addCommandToHistory (command: string): void {
    this._commandHistory.push(command)
    this.lastExecutedCommand = command

    if (this._commandHistory.length > constants.SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY) {
      this._commandHistory.shift()
    }

    this.validate()
  }

  //! -------- Getters & Setters -------- //

  private get version (): Version { return this._version }

  public get metadata (): RemoteConfigMetadata { return this._metadata }

  public set metadata (metadata: RemoteConfigMetadata) {
    this._metadata = metadata
    this.validate()
  }

  public get clusters (): Record<Cluster, Namespace> { return this._clusters }

  public set clusters (clusters: Record<Cluster, Namespace>) {
    this._clusters = clusters
    this.validate()
  }

  public get components (): ComponentsDataWrapper { return this._components }

  public set components (components: ComponentsDataWrapper) {
    this._components = components
    this.validate()
  }

  public get lastExecutedCommand (): string { return this._lastExecutedCommand }

  private set lastExecutedCommand (lastExecutedCommand: string) {
    this._lastExecutedCommand = lastExecutedCommand
    this.validate()
  }

  public get commandHistory (): string[] { return this._commandHistory }

  private set commandHistory (commandHistory: string[]) {
    this._commandHistory = commandHistory
    this.validate()
  }

  //! -------- Utilities -------- //

  public static compare (x: RemoteConfigDataWrapper, y: RemoteConfigDataWrapper): boolean {
    // TODO
    return true
  }

  public static fromConfigmap (configMap: k8s.V1ConfigMap): RemoteConfigDataWrapper {
    const unparsed = yaml.load(configMap.data['remote-config-data']) as any

    return new RemoteConfigDataWrapper({
      metadata: RemoteConfigMetadata.fromObject(unparsed.metadata),
      components: ComponentsDataWrapper.fromObject(unparsed.components),
      clusters: unparsed.clusters,
      commandHistory: unparsed.commandHistory,
      lastExecutedCommand: unparsed.lastExecutedCommand,
    })
  }

  public validate (): void {
    if (!this._version || typeof this._version !== 'string') {
      throw new SoloError(`Invalid remote config version: ${this._version}`)
    }

    if (!this.metadata || !(this.metadata instanceof RemoteConfigMetadata)) {
      throw new SoloError(`Invalid remote config metadata: ${this.metadata}`)
    }

    if (!this.lastExecutedCommand || typeof this.lastExecutedCommand !== 'string') {
      throw new SoloError(`Invalid remote config last executed command: ${this.lastExecutedCommand}`)
    }

    if (!Array.isArray(this.commandHistory) || this.commandHistory.some((c) => typeof c !== 'string')) {
      throw new SoloError(`Invalid remote config command history: ${this.commandHistory}`)
    }

    Object.entries(this.clusters).forEach(([cluster, namespace]: [Cluster, Namespace]): void => {
      const clusterDataString = `cluster: { name: ${cluster}, namespace: ${namespace} }`

      if (!cluster || typeof cluster !== 'string') {
        throw new SoloError(`Invalid remote config clusters name: ${clusterDataString}`)
      }

      if (!namespace || typeof namespace !== 'string') {
        throw new SoloError(`Invalid remote config clusters namespace: ${clusterDataString}`)
      }
    })
  }

  public toObject (): RemoteConfigDataStructure {
    return {
      metadata: this.metadata.toObject(),
      version: this.version,
      clusters: this.clusters,
      components: this.components.toObject(),
      commandHistory: this.commandHistory,
      lastExecutedCommand: this.lastExecutedCommand,
    }
  }
}