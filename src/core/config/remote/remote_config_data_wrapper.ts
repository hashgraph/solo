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
import type {
  Cluster, Version, Namespace, Component, RemoteConfigData, RemoteConfigMetadataStructure,
} from './types.ts'
import semver from 'semver'
import { SoloError } from '../../errors.ts'
import { ComponentTypeEnum } from './enumerations.ts'

export class RemoteConfigDataWrapper {
  private version: Version
  private metadata: RemoteConfigMetadataStructure
  private clusters: Record<Cluster, Namespace>
  private components: Record<ComponentTypeEnum, Record<string, Component>>

  constructor (data: RemoteConfigData) {
    this.version = data.version
    this.metadata = data.metadata
    this.clusters = data.clusters
    this.components = data.components

    this.validate()
  }

  private validate () {
    if (!semver.valid(this.version)) {
      throw new SoloError(`Invalid remote config version: ${this.version}`)
    }

    if (!this.metadata) {
      throw new SoloError(`Invalid remote config metadata: ${this.metadata}`)
    }

    Object.entries(this.clusters).forEach(([cluster, namespace]: [Cluster, Namespace]) => {
      const clusterDataString = `cluster: { name: ${cluster}, namespace: ${namespace} }`

      if (typeof cluster !== 'string') {
        throw new SoloError(`Invalid remote config clusters name: ${clusterDataString}`)
      }

      if (typeof namespace !== 'string') {
        throw new SoloError(`Invalid remote config clusters namespace: ${clusterDataString}`)
      }
    })

    Object.entries(this.components).forEach(([type, data]: [ComponentTypeEnum, Record<string, Component>]) => {
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

  public toObject () {
    return {
      metadata: this.metadata.toObject(),
      version: this.version,
      clusters: this.clusters,
      components: this.components,
    }
  }
}