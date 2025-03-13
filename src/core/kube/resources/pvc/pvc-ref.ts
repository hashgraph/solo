// SPDX-License-Identifier: Apache-2.0

import {ResourceRef} from '../resource_ref.js';
import {type NamespaceName} from '../namespace/namespace_name.js';
import {type PvcName} from './pvc_name.js';

/**
 * Represents a Kubernetes PVC (persistent volume claim) reference which includes the namespace name and PVC name.
 */
export class PvcRef extends ResourceRef<PvcName> {
  private constructor(namespace: NamespaceName, name: PvcName) {
    super(namespace, name);
  }

  /**
   * Creates a PVC (persistent volume claim) reference.
   * @param namespace The namespace name.
   * @param pvcName The PVC name.
   */
  public static of(namespace: NamespaceName, pvcName: PvcName): PvcRef {
    return new PvcRef(namespace, pvcName);
  }
}
