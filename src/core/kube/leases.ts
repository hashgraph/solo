/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Lease, type V1Status} from '@kubernetes/client-node';

export default interface Leases {
  create(namespace: string, leaseName: string, holderName: string, durationSeconds: number): Promise<V1Lease>; // TODO was createNamespacedLease
  delete(namespace: string, name: string): Promise<V1Status>; // TODO was deleteNamespacedLease
  read(namespace: string, leaseName: string, timesCalled: number): Promise<any>; // TODO was readNamespacedLease
  renew(namespace: string, leaseName: string, lease: V1Lease): Promise<V1Lease>; // TODO was renewNamespacedLease
  transfer(lease: V1Lease, newHolderName: string): Promise<V1Lease>; // TODO was transferNamespaceLease
}
