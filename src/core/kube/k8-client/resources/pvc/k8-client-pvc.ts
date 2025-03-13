// SPDX-License-Identifier: Apache-2.0

import {type Pvc} from '../../../resources/pvc/pvc.js';
import {type PvcRef} from '../../../resources/pvc/pvc_ref.js';

export class K8ClientPvc implements Pvc {
  constructor(public readonly pvcRef: PvcRef) {}
}
