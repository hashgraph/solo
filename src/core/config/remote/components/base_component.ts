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
import { ComponentTypeEnum } from '../enumerations.js'
import { SoloError } from '../../../errors.js'
import type { Cluster, Component, Namespace, ComponentName } from '../types.js'
import type { ToObject, Validate } from '../../../../types/index.js'

/**
 * Represents the base structure and common functionality for all components within the system.
 * This class provides validation, comparison, and serialization functionality for components.
 */
export abstract class BaseComponent implements Component, Validate, ToObject<Component> {
  /** The type of the component */
  private readonly _type: ComponentTypeEnum

  /** The name of the component. */
  private readonly _name: ComponentName

  /** The cluster associated with the component. */
  private readonly _cluster: Cluster

  /** The namespace associated with the component. */
  private readonly _namespace: Namespace

  /**
   * @param type - for identifying.
   * @param name - to distinguish components.
   * @param cluster - in which the component is deployed.
   * @param namespace - associated with the component.
   */
  protected constructor (type: ComponentTypeEnum, name: ComponentName, cluster: Cluster, namespace: Namespace) {
    this._type = type
    this._name = name
    this._cluster = cluster
    this._namespace = namespace
  }

  /* -------- Getters -------- */

  /**
   * Retrieves the type of the component
   * @readonly
   */
  public get type (): ComponentTypeEnum { return this._type }

  /**
   * Retrieves the name of the component.
   * @readonly
   */
  public get name (): ComponentName { return this._name }

  /**
   * Retrieves the cluster associated with the component.
   * @readonly
   */
  public get cluster (): Cluster { return this._cluster }

  /**
   * Retrieves the namespace associated with the component.
   * @readonly
   */
  public get namespace (): Namespace { return this._namespace }

  /* -------- Utilities -------- */

  /**
   * Compares two BaseComponent instances for equality.
   *
   * @param x - The first component to compare
   * @param y - The second component to compare
   * @returns boolean - true if the components are equal
   */
  public static compare (x: BaseComponent, y: BaseComponent): boolean {
    return (
      x.type === y.type &&
      x.cluster === y.cluster &&
      x.namespace === y.namespace
    )
  }

  public validate (): void {
    if (!this.name || typeof this.name !== 'string') {
      throw new SoloError(`Invalid name: ${this.name}`)
    }

    if (!this.cluster || typeof this.cluster !== 'string') {
      throw new SoloError(`Invalid cluster: ${this.cluster}`)
    }

    if (!this.namespace || typeof this.namespace !== 'string') {
      throw new SoloError(`Invalid namespace: ${this.namespace}`)
    }

    if (!Object.values(ComponentTypeEnum).includes(this.type)) {
      throw new SoloError('Invalid ComponentTypeEnum value')
    }
  }

  public toObject (): Component {
    return {
      name: this.name,
      cluster: this.cluster,
      namespace: this.namespace,
    }
  }
}
