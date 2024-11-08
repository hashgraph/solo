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
import semver from 'semver'
import { SoloError } from '../../errors.ts'
import { ComponentTypeEnum } from './enumerations.ts'
import * as version from '../../../../version.ts'
import yaml from 'js-yaml'
import { RemoteConfigMetadata } from './metadata.ts'
import { ComponentsDataWrapper } from './components_data_wrapper.ts'
import type {
  Cluster, Version, Namespace, Component, RemoteConfigData, EmailAddress
} from './types.ts'
import type * as k8s from '@kubernetes/client-node'

export class RemoteConfigDataWrapper {
  private readonly _version: Version = version.HEDERA_PLATFORM_VERSION
  private _metadata: RemoteConfigMetadata
  private _clusters: Record<Cluster, Namespace>
  private _components: ComponentsDataWrapper

  constructor (data: RemoteConfigData) {
    this._metadata = data.metadata
    this._clusters = data.clusters
    this._components = data.components
    this.validate()
  }

  static fromConfigmap (configMap: k8s.V1ConfigMap) {
    const unparsed = yaml.load(configMap.data['remote-config-data']) as any

    return new RemoteConfigDataWrapper({
      metadata: RemoteConfigMetadata.fromObject(unparsed.metadata),
      components: ComponentsDataWrapper.fromObject(unparsed.components),
      clusters: unparsed.clusters,
    })
  }

  makeMigration (email: EmailAddress, fromVersion: Version) {
    this.metadata.makeMigration(email, fromVersion)
  }

  get metadata () { return this._metadata }

  set metadata (metadata: RemoteConfigMetadata) {
    this._metadata = metadata
    this.validate()
  }

  get clusters () { return this._clusters }

  set clusters (clusters: Record<Cluster, Namespace>) {
    this._clusters = clusters
    this.validate()
  }

  get components () { return this._components }

  set components (components: ComponentsDataWrapper) {
    this._components = components
    this.validate()
  }

  private validate () {
    if (!semver.valid(this._version)) {
      throw new SoloError(`Invalid remote config version: ${this._version}`)
    }

    if (!this._metadata) {
      throw new SoloError(`Invalid remote config metadata: ${this._metadata}`)
    }

    Object.entries(this._clusters).forEach(([cluster, namespace]: [Cluster, Namespace]) => {
      const clusterDataString = `cluster: { name: ${cluster}, namespace: ${namespace} }`

      if (typeof cluster !== 'string') {
        throw new SoloError(`Invalid remote config clusters name: ${clusterDataString}`)
      }

      if (typeof namespace !== 'string') {
        throw new SoloError(`Invalid remote config clusters namespace: ${clusterDataString}`)
      }
    })

    Object.entries(this._components).forEach(([type, data]: [ComponentTypeEnum, Record<string, Component>]) => {
      const componentDataString = `component: { type: ${type}, data: ${data} }`

      if (!Object.values(ComponentTypeEnum).includes(type)) {
        throw new Error(`Invalid component type: ${componentDataString}`)
      }

      if (typeof data !== 'object') {
        throw new Error(`Invalid component data: ${componentDataString}`)
      }

      Object.entries(data).forEach(([name, component] : [string, Component]) => {
        if (typeof name !== 'string') {
          throw new Error(`Invalid component data name: ${name}, component: ${component}`)
        }

        if (typeof component.name !== 'string') {
          throw new Error(`Invalid component name: ${name}, component: ${component}`)
        }

        if (typeof component.cluster !== 'string') {
          throw new Error(`Invalid component cluster: ${name}, component: ${component}`)
        }

        if (typeof component.namespace !== 'string') {
          throw new Error(`Invalid component namespace: ${name}, component: ${component}`)
        }
      })
    })
  }

  toObject () {
    return {
      metadata: this._metadata.toObject(),
      version: this._version,
      clusters: this._clusters,
      components: this._components,
    }
  }
}