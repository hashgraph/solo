/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {type V1Lease, type V1Status} from '@kubernetes/client-node';

export default interface Leases {
  create(namespace: string, leaseName: string, holderName: string, durationSeconds: number): Promise<V1Lease>; // TODO was createNamespacedLease
  delete(namespace: string, name: string): Promise<V1Status>; // TODO was deleteNamespacedLease
  read(namespace: string, leaseName: string, timesCalled: number): Promise<any>; // TODO was readNamespacedLease
  renew(namespace: string, leaseName: string, lease: V1Lease): Promise<V1Lease>; // TODO was renewNamespacedLease
  transfer(lease: V1Lease, newHolderName: string): Promise<V1Lease>; // TODO was transferNamespaceLease
}
