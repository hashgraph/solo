/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type PodRef} from './pod_ref.js';
import {type ContainerName} from './container_name.js';
import {MissingContainerNameError, MissingPodRefError} from './errors/namespace_name_invalid_error.js';

/**
 * Represents a Kubernetes pod reference which includes the namespace name and pod name.
 */
export class ContainerRef {
  private constructor(
    public readonly podRef: PodRef,
    public readonly containerName: ContainerName,
  ) {
    if (!podRef) {
      throw new MissingPodRefError();
    }
    if (!containerName) {
      throw new MissingContainerNameError();
    }
  }

  /**
   * Creates a container reference.
   * @param podRef The namespace name.
   * @param containerName The pod name.
   */
  public static of(podRef: PodRef, containerName: ContainerName): ContainerRef {
    return new ContainerRef(podRef, containerName);
  }

  /**
   * Compares this instance with another ContainerRef.
   * @param other The other ContainerRef instance.
   * @returns true if both instances have the same pod ref and container name.
   */
  public equals(other: ContainerRef): boolean {
    return (
      other instanceof ContainerRef &&
      this.podRef.equals(other.podRef) &&
      this.containerName.equals(other.containerName)
    );
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The container reference as a string.
   */
  public toString(): string {
    return `{podRef: ${this.podRef.toString()}, containerName: ${this.containerName.toString()}}`;
  }
}
