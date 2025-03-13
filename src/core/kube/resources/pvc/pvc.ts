// SPDX-License-Identifier: Apache-2.0

import {type PvcRef} from './pvc_ref.js';

export interface Pvc {
  /**
   * The PVC (persistent volume claim) reference
   */
  readonly pvcRef: PvcRef;
}
