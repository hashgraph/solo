/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from '../namespace/namespace_name.js';

/**
 * SPDX-License-Identifier: Apache-2.0
 */
export interface Lease {
  readonly namespace: NamespaceName;
  readonly leaseName: string;
  readonly holderName: string;
  readonly durationSeconds: number;
  readonly acquireTime?: Date;
  readonly renewTime?: Date;
}
