// SPDX-License-Identifier: Apache-2.0

import {type Pvc} from '../../../resources/pvc/pvc.js';
import {type PvcReference as PvcReference} from '../../../resources/pvc/pvc-reference.js';

export class K8ClientPvc implements Pvc {
  constructor(public readonly pvcReference: PvcReference) {}
}
