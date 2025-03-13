// SPDX-License-Identifier: Apache-2.0

import {type PodRef} from '../pod/pod-ref.js';
import {type ContainerName} from './container-name.js';
import {NestedResourceRef} from '../nested-resource-ref.js';

/**
 * Represents a Kubernetes pod reference which includes the namespace name and pod name.
 */
export class ContainerRef extends NestedResourceRef<PodRef, ContainerName> {
  private constructor(parentRef: PodRef, name: ContainerName) {
    super(parentRef, name);
  }

  /**
   * Creates a container reference.
   * @param podRef The namespace name.
   * @param containerName The pod name.
   */
  public static of(podRef: PodRef, containerName: ContainerName): ContainerRef {
    return new ContainerRef(podRef, containerName);
  }
}
