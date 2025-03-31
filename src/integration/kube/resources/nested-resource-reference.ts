// SPDX-License-Identifier: Apache-2.0

import {type ResourceRef as ResourceReference} from './resource-ref.js';
import {type ResourceName} from './resource-name.js';
import {MissingParentResourceRefError as MissingParentResourceReferenceError} from '../errors/missing-parent-resource-error.js';
import {MissingResourceNameError} from '../errors/missing-resource-name-error.js';

export abstract class NestedResourceRef<P extends ResourceReference<any>, T extends ResourceName> {
  protected constructor(
    public readonly parentReference: P,
    public readonly name: T,
  ) {
    if (!parentReference) {
      throw new MissingParentResourceReferenceError();
    }
    if (!name) {
      throw new MissingResourceNameError();
    }
  }

  /**
   * Compares this instance with another NestedResourceRef.
   * @param other The other NestedResourceRef instance.
   * @returns true if both instances have the same parent reference and name.
   */
  public equals(other: NestedResourceRef<P, T>): boolean {
    return other instanceof NestedResourceRef && this.parentRef.equals(other.parentRef) && this.name.equals(other.name);
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The nested resource reference as a string.
   */
  public toString(): string {
    return `{parentRef: ${this.parentRef}, name: ${this.name}}`;
  }
}
