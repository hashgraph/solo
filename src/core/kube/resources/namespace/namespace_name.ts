// SPDX-License-Identifier: Apache-2.0

import {isDns1123Label} from '../../kube_validation.js';
import {NamespaceNameInvalidError} from '../../errors/namespace_name_invalid_error.js';

/**
 * Represents a Kubernetes namespace name. A Kubernetes namespace name must
 * be a valid RFC-1123 DNS label.
 *
 * @include DNS_1123_LABEL
 */
export class NamespaceName {
  private constructor(public readonly name: string) {
    if (!this.isValid()) {
      throw new NamespaceNameInvalidError(name);
    }
  }

  /**
   * Creates a namespace. A Kubernetes namespace name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   * @param name The name of the namespace.
   * @returns An instance of NamespaceName.
   * @throws NamespaceNameInvalidError if the namespace name is invalid.
   */
  public static of(name: string): NamespaceName {
    return new NamespaceName(name);
  }

  /**
   * Returns true if the namespace name is valid.  A Kubernetes namespace name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @returns true if the namespace name is valid.
   * @throws NamespaceNameInvalidError if the namespace name is invalid.
   */
  private isValid(): boolean {
    return isDns1123Label(this.name);
  }

  /**
   * Compares this instance with another NamespaceName.
   * @param other The other NamespaceName instance.
   * @returns true if both instances have the same name.
   */
  public equals(other: NamespaceName): boolean {
    return other instanceof NamespaceName && this.name === other.name;
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The namespace name as a string.
   */
  public toString(): string {
    return this.name;
  }

  /**
   * Allows `NamespaceName` to be used as a primitive string in operations.
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
