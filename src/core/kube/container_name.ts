/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {isDns1123Label} from './kube_validation.js';
import {ContainerNameInvalidError} from './kube_errors.js';

/**
 * Represents a Kubernetes container name. A Kubernetes container name must be a valid RFC-1123 DNS label.
 *
 * @include DNS_1123_LABEL
 */
export class ContainerName {
  private constructor(public readonly name: string) {
    if (!this.isValid()) {
      throw new ContainerNameInvalidError(name);
    }
  }

  /**
   * Creates a container. A Kubernetes container name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @param name The name of the container.
   * @returns An instance of ContainerName.
   * @throws ContainerNameInvalidError if the container name is invalid.
   */
  public static of(name: string): ContainerName {
    return new ContainerName(name);
  }

  /**
   * Returns true if the container name is valid.  A Kubernetes container name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @returns true if the container name is valid.
   * @throws ContainerNameInvalidError if the container name is invalid.
   */
  private isValid(): boolean {
    return isDns1123Label(this.name);
  }

  /**
   * Compares this instance with another ContainerName.
   * @param other The other ContainerName instance.
   * @returns true if both instances have the same name.
   */
  public equals(other: ContainerName): boolean {
    return other instanceof ContainerName && this.name === other.name;
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The container name as a string.
   */
  public toString(): string {
    return this.name;
  }

  /**
   * Allows `ContainerName` to be used as a primitive string in operations.
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
