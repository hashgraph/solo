// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../errors/solo-error.js';
import {DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {ComponentTypes} from '../enumerations/component-types.js';
import {isValidEnum} from '../../../util/validation-helpers.js';
import {type ClusterReference, type ComponentName, type NamespaceNameAsString} from '../types.js';
import {type ToObject, type Validate} from '../../../../types/index.js';
import {type BaseComponentStruct} from './interfaces/base-component-struct.js';

/**
 * Represents the base structure and common functionality for all components within the system.
 * This class provides validation, comparison, and serialization functionality for components.
 */
export class BaseComponent implements BaseComponentStruct, Validate, ToObject<BaseComponentStruct> {
  private _phase: DeploymentPhase;

  /**
   * @param type - type for identifying.
   * @param name - the name to distinguish components.
   * @param cluster - the cluster in which the component is deployed.
   * @param namespace - the namespace associated with the component.
   * @param phase - the phase of the component
   */
  protected constructor(
    public readonly type: ComponentTypes,
    public readonly name: ComponentName,
    public readonly cluster: ClusterReference,
    public readonly namespace: NamespaceNameAsString,
    phase: DeploymentPhase,
  ) {
    this._phase = phase;
  }

  /* -------- Utilities -------- */

  /**
   * Compares two BaseComponent instances for equality.
   *
   * @param x - The first component to compare
   * @param y - The second component to compare
   * @returns boolean - true if the components are equal
   */
  public static compare(x: BaseComponent, y: BaseComponent): boolean {
    return (
      x.name === y.name &&
      x.type === y.type &&
      x.cluster === y.cluster &&
      x.namespace === y.namespace &&
      x.phase === y.phase
    );
  }

  public get phase(): DeploymentPhase {
    return this._phase;
  }

  private set phase(phase: DeploymentPhase) {
    this._phase = phase;
    this.validate();
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

    if (!isValidEnum(this.phase, DeploymentPhase)) {
      throw new SoloError(`Invalid component type: ${this.type}`);
    }

    if (!isValidEnum(this.type, ComponentTypes)) {
      throw new SoloError(`Invalid component type: ${this.type}`);
    }
  }

  public toObject(): BaseComponentStruct {
    return {
      name: this.name,
      cluster: this.cluster,
      namespace: this.namespace,
      phase: this.phase,
    };
  }
}
