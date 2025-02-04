/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {MissingNamespaceNameError, MissingPodNameError} from './kube_errors.js';
import {type PodName} from './pod_name.js';
import {type NamespaceName} from './namespace_name.js';

/**
 * Represents a Kubernetes pod reference which includes the namespace name and pod name.
 */
export class PodRef {
  private constructor(
    public readonly namespaceName: NamespaceName,
    public readonly podName: PodName,
  ) {
    if (!namespaceName) {
      throw new MissingNamespaceNameError();
    }
    if (!podName) {
      throw new MissingPodNameError();
    }
  }

  /**
   * Creates a pod reference.
   * @param namespace The namespace name.
   * @param podName The pod name.
   */
  public static of(namespace: NamespaceName, podName: PodName): PodRef {
    return new PodRef(namespace, podName);
  }

  /**
   * Compares this instance with another PodRef.
   * @param other The other PodRef instance.
   * @returns true if both instances have the same namespace name and pod name.
   */
  public equals(other: PodRef): boolean {
    return other instanceof PodRef && this.namespaceName === other.namespaceName && this.podName === other.podName;
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The pod reference as a string.
   */
  public toString(): string {
    return `{namespaceName: ${this.namespaceName}, podName: ${this.podName}}`;
  }
}
