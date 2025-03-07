/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Status} from '@kubernetes/client-node';
import {type NamespaceName} from '../namespace/namespace_name.js';
import {type Lease} from './lease.js';

export interface Leases {
  /**
   * Create a new lease
   * @param namespace - the namespace to create the lease in
   * @param leaseName - the name of the lease
   * @param holderName - the name of the lease holder
   * @param durationSeconds - the duration of the lease in seconds\
   * @returns the created lease
   */
  create(namespace: NamespaceName, leaseName: string, holderName: string, durationSeconds: number): Promise<Lease>;

  /**
   * Delete a lease
   * @param namespace - the namespace of the lease
   * @param name - the name of the lease
   * @returns the status of the deletion
   */
  delete(namespace: NamespaceName, name: string): Promise<V1Status>;

  /**
   * Returns the lease with the specified name
   * @param namespace - the namespace to list leases in
   * @param leaseName - the name of the lease
   * @param timesCalled - the number of times this function has been called
   * @returns a list of lease names
   */
  read(namespace: NamespaceName, leaseName: string, timesCalled?: number): Promise<any>;

  /**
   * Renew a lease
   * @param namespace - the namespace of the lease
   * @param leaseName - the name of the lease
   * @param lease - the lease object
   * @returns the renewed lease
   */
  renew(namespace: NamespaceName, leaseName: string, lease: Lease): Promise<Lease>;

  /**
   * Transfer a lease
   * @param lease - the lease object
   * @param newHolderName - the name of the new lease holder
   * @returns the transferred lease
   */
  transfer(lease: Lease, newHolderName: string): Promise<Lease>;
}
