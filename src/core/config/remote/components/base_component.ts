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
import {ComponentType} from '../enumerations.js';
import {SoloError} from '../../../errors.js';
import type {Cluster, Component, Namespace, ComponentName} from '../types.js';
import type {ToObject, Validate} from '../../../../types/index.js';

/**
 * Represents the base structure and common functionality for all components within the system.
 * This class provides validation, comparison, and serialization functionality for components.
 */
export abstract class BaseComponent implements Component, Validate, ToObject<Component> {
  /**
   * @param type - type for identifying.
   * @param name - the name to distinguish components.
   * @param cluster - the cluster in which the component is deployed.
   * @param namespace - the namespace associated with the component.
   */
  protected constructor(
    public readonly type: ComponentType,
    public readonly name: ComponentName,
    public readonly cluster: Cluster,
    public readonly namespace: Namespace,
  ) {}

  /* -------- Utilities -------- */

  /**
   * Compares two BaseComponent instances for equality.
   *
   * @param x - The first component to compare
   * @param y - The second component to compare
   * @returns boolean - true if the components are equal
   */
  public static compare(x: BaseComponent, y: BaseComponent): boolean {
    return x.name === y.name && x.type === y.type && x.cluster === y.cluster && x.namespace === y.namespace;
  }

  public validate(): void {
    if (!this.name || typeof this.name !== 'string') {
      throw new SoloError(`Invalid name: ${this.name}`);
    }

    if (!this.cluster || typeof this.cluster !== 'string') {
      throw new SoloError(`Invalid cluster: ${this.cluster}`);
    }

    if (!this.namespace || typeof this.namespace !== 'string') {
      throw new SoloError(`Invalid namespace: ${this.namespace}`);
    }

    if (!Object.values(ComponentType).includes(this.type)) {
      throw new SoloError(`Invalid component type: ${this.type}`);
    }
  }

  public toObject(): Component {
    return {
      name: this.name,
      cluster: this.cluster,
      namespace: this.namespace,
    };
  }
}
