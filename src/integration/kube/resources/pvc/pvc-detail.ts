// SPDX-License-Identifier: Apache-2.0

import {type PvcReference} from './pvc-reference.js';

/**
 * A PersistentVolumeClaim together with the fields needed to judge whether it was satisfied:
 * its binding phase and the storage it requested. A claim reference alone cannot answer either
 * question.
 */
export interface PvcDetail {
  /** The PVC (persistent volume claim) reference. */
  readonly pvcReference: PvcReference;

  /** The binding phase reported by Kubernetes (for example Pending, Bound, Lost). */
  readonly phase: string;

  /**
   * `spec.resources.requests.storage` in bytes, or undefined when the claim requests no storage or
   * the quantity cannot be parsed.
   */
  readonly requestedStorageBytes: number | undefined;

  /** Name of the storage class backing the claim, or undefined when the cluster default is used. */
  readonly storageClassName: string | undefined;
}
