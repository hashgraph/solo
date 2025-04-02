// SPDX-License-Identifier: Apache-2.0

import {type PodReference} from '../pod/pod-reference.js';
import {type ContainerName} from './container-name.js';
import {NestedResourceReference} from '../nested-resource-reference.js';

/**
 * Represents a Kubernetes pod reference which includes the namespace name and pod name.
 */
export class ContainerReference extends NestedResourceReference<PodReference, ContainerName> {
  private constructor(parentReference: PodReference, name: ContainerName) {
    super(parentReference, name);
  }

  /**
   * Creates a container reference.
   * @param podRef The namespace name.
   * @param containerName The pod name.
   */
  public static of(podReference: PodReference, containerName: ContainerName): ContainerReference {
    return new ContainerReference(podReference, containerName);
  }
}
