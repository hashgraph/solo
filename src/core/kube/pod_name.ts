/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {isDns1123Label} from './kube_validation.js';
import {PodNameInvalidError} from './kube_errors.js';

/**
 * Represents a Kubernetes pod name. A Kubernetes pod name must be a valid RFC-1123 DNS label.
 *
 * @include DNS_1123_LABEL
 */
export class PodName {
  private constructor(public readonly name: string) {
    if (!this.isValid()) {
      throw new PodNameInvalidError(name);
    }
  }

  /**
   * Creates a pod. A Kubernetes pod name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @param name The name of the pod.
   * @returns An instance of PodName.
   * @throws PodNameInvalidError if the pod name is invalid.
   */
  public static of(name: string): PodName {
    return new PodName(name);
  }

  /**
   * Returns true if the pod name is valid.  A Kubernetes pod name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @returns true if the pod name is valid.
   * @throws PodNameInvalidError if the pod name is invalid.
   */
  private isValid(): boolean {
    return isDns1123Label(this.name);
  }

  /**
   * Compares this instance with another PodName.
   * @param other The other PodName instance.
   * @returns true if both instances have the same name.
   */
  public equals(other: PodName): boolean {
    return other instanceof PodName && this.name === other.name;
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
