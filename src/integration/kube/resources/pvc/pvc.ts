// SPDX-License-Identifier: Apache-2.0

import {type PvcReference} from './pvc-reference.js';

export interface Pvc {
  /**
   * The PVC (persistent volume claim) reference
   */
  readonly pvcReference: PvcReference;
}
