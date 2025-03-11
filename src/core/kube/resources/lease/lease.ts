// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../namespace/namespace_name.js';

/**
 * Represents a Kubernetes Lease
 */
export interface Lease {
  /**
   * The namespace of the lease
   */
  readonly namespace: NamespaceName;

  /**
   * The name of the lease
   */
  readonly leaseName: string;

  /**
   * The name of the lease-holder
   */
  readonly holderName: string;

  /**
   * The duration of the lease in seconds
   */
  readonly durationSeconds: number;

  /**
   * The time the lease was acquired
   */
  readonly acquireTime?: Date;

  /**
   * The time the lease was renewed
   */
  readonly renewTime?: Date;

  /**
   * The resource version of the lease
   */
  readonly resourceVersion?: string;
}
