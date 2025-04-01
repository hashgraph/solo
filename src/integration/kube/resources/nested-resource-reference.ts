// SPDX-License-Identifier: Apache-2.0

import {type ResourceReference} from './resource-reference.js';
import {type ResourceName} from './resource-name.js';
import {MissingParentResourceReferenceError as MissingParentResourceReferenceError} from '../errors/missing-parent-resource-reference-error.js';
import {MissingResourceNameError} from '../errors/missing-resource-name-error.js';

export abstract class NestedResourceReference<P extends ResourceReference<any>, T extends ResourceName> {
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
   * Compares this instance with another NestedResourceReference.
   * @param other The other NestedResourceReference instance.
   * @returns true if both instances have the same parent reference and name.
   */
  public equals(other: NestedResourceReference<P, T>): boolean {
    return (
      other instanceof NestedResourceReference &&
      this.parentReference.equals(other.parentReference) &&
      this.name.equals(other.name)
    );
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The nested resource reference as a string.
   */
  public toString(): string {
    return `{parentRef: ${this.parentReference}, name: ${this.name}}`;
  }
}
