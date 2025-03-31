// SPDX-License-Identifier: Apache-2.0

import {type PodRef as PodReference} from '../pod/pod-ref.js';
import {type ContainerName} from './container-name.js';
import {NestedResourceRef as NestedResourceReference} from '../nested-resource-ref.js';

/**
 * Represents a Kubernetes pod reference which includes the namespace name and pod name.
 */
export class ContainerRef extends NestedResourceReference<PodReference, ContainerName> {
  private constructor(parentReference: PodReference, name: ContainerName) {
    super(parentReference, name);
  }

  /**
   * Creates a container reference.
   * @param podRef The namespace name.
   * @param containerName The pod name.
   */
  public static of(podReference: PodReference, containerName: ContainerName): ContainerRef {
    return new ContainerRef(podReference, containerName);
  }
}
