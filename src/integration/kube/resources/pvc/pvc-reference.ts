// SPDX-License-Identifier: Apache-2.0

import {ResourceReference as ResourceReference} from '../resource-reference.js';
import {type NamespaceName} from '../namespace/namespace-name.js';
import {type PvcName} from './pvc-name.js';

/**
 * Represents a Kubernetes PVC (persistent volume claim) reference which includes the namespace name and PVC name.
 */
export class PvcReference extends ResourceReference<PvcName> {
  private constructor(namespace: NamespaceName, name: PvcName) {
    super(namespace, name);
  }

  /**
   * Creates a PVC (persistent volume claim) reference.
   * @param namespace The namespace name.
   * @param pvcName The PVC name.
   */
  public static of(namespace: NamespaceName, pvcName: PvcName): PvcReference {
    return new PvcReference(namespace, pvcName);
  }
}
