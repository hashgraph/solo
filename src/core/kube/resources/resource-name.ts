// SPDX-License-Identifier: Apache-2.0

import {isDns1123Label} from '../kube-validation.js';
import {InvalidResourceNameError} from '../errors/invalid-resource-name-error.js';
import {type ResourceType} from './resource-type.js';

export abstract class ResourceName {
  protected constructor(
    type: ResourceType,
    public readonly name: string,
  ) {
    if (!this.isValid()) {
      throw new InvalidResourceNameError(name, type);
    }
  }

  /**
   * Returns true if the pod name is valid.  A Kubernetes pod name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @returns true if the pod name is valid.
   * @throws InvalidResourceNameError if the pod name is invalid.
   */
  private isValid(): boolean {
    return isDns1123Label(this.name);
  }

  /**
   * Compares this instance with another PodName.
   * @param other The other PodName instance.
   * @returns true if both instances have the same name.
   */
  public equals(other: ResourceName): boolean {
    return other instanceof ResourceName && this.name === other.name;
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The pod name as a string.
   */
  public toString(): string {
    return this.name;
  }

  /**
   * Allows `PodName` to be used as a primitive string in operations.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public [Symbol.toPrimitive](hint: string): string {
    return this.name;
  }

  /**
   * Returns the primitive value of the object.
   */
  public valueOf(): string {
    return this.name;
  }
}
