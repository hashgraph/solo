// SPDX-License-Identifier: Apache-2.0

import {ComponentType} from '../enumerations.js';
import {SoloError} from '../../../errors/SoloError.js';
import {type ClusterRef, type Component, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type ToObject, type Validate} from '../../../../types/index.js';

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
    public readonly cluster: ClusterRef,
    public readonly namespace: NamespaceNameAsString,
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
      throw new SoloError(
        `Invalid namespace: ${this.namespace}, is typeof 'string': ${typeof this.namespace !== 'string'}`,
      );
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
