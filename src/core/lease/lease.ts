/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type K8Factory} from '../kube/k8_factory.js';
import {type LeaseHolder} from './lease_holder.js';
import {type Duration} from '../time/duration.js';
import {type NamespaceName} from '../kube/resources/namespace/namespace_name.js';

export interface Lease {
  readonly k8Factory: K8Factory;
  readonly renewalService: LeaseRenewalService;
  readonly leaseName: string;
  readonly leaseHolder: LeaseHolder;
  readonly namespace: NamespaceName;
  readonly durationSeconds: number;
  scheduleId: number;

  /**
   * Acquires the lease. If the lease is already acquired, it checks if the lease is expired or held by the same process.
   * If the lease is expired, it creates a new lease. If the lease is held by the same process, it renews the lease.
   * If the lease is held by another process, then an exception is thrown.
   *
   * @throws LeaseAcquisitionError - If the lease is already acquired by another process or an error occurs during acquisition.
   */
  acquire(): Promise<void>;

  /**
   * Attempts to acquire the lease, by calling the acquire method. If an exception is thrown, it is caught and false is returned.
   * If the lease is successfully acquired, true is returned; otherwise, false is returned.
   *
   * @returns true if the lease is successfully acquired; otherwise, false.
   */
  tryAcquire(): Promise<boolean>;

  /**
   * Renews the lease. If the lease is expired or held by the same process, it creates or renews the lease.
   * If the lease is held by another process, then an exception is thrown.
   *
   * @throws LeaseAcquisitionError - If the lease is already acquired by another process or an error occurs during renewal.
   */
  renew(): Promise<void>;

  /**
   * Attempts to renew the lease, by calling the renew method. If an exception is thrown, it is caught and false is returned.
   * If the lease is successfully renewed, true is returned; otherwise, false is returned.
   *
   * @returns true if the lease is successfully renewed; otherwise, false.
   */
  tryRenew(): Promise<boolean>;

  /**
   * Releases the lease. If the lease is expired or held by the same process, it deletes the lease.
   * If the lease is held by another process, then an exception is thrown.
   *
   * @throws LeaseRelinquishmentError - If the lease is already acquired by another process or an error occurs during relinquishment.
   */
  release(): Promise<void>;

  /**
   * Attempts to release the lease, by calling the release method. If an exception is thrown, it is caught and false is returned.
   * If the lease is successfully released, true is returned; otherwise, false is returned.
   *
   * @returns true if the lease is successfully released; otherwise, false.
   */
  tryRelease(): Promise<boolean>;

  /**
   * Checks if the lease is acquired. If the lease is acquired and not expired, it returns true; otherwise, false.
   *
   * @returns true if the lease is acquired and not expired; otherwise, false.
   */
  isAcquired(): Promise<boolean>;

  /**
   * Checks if the lease is expired. If the lease is expired, it returns true; otherwise, false.
   * This method does not verify if the lease is acquired by the current process.
   *
   * @returns true if the lease is expired; otherwise, false.
   */
  isExpired(): Promise<boolean>;
}

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
export interface LeaseRenewalService {
  /**
   * Determines if a lease renewal is scheduled.
   * @param scheduleId - the unique identifier of the scheduled lease renewal.
   * @returns true if the lease renewal is scheduled; false otherwise.
   */
  isScheduled(scheduleId: number): Promise<boolean>;

  /**
   * Schedules a lease renewal.
   * @param lease - the lease to be renewed.
   * @returns the unique identifier of the scheduled lease renewal.
   */
  schedule(lease: Lease): Promise<number>;

  /**
   * Cancels a scheduled lease renewal.
   * @param scheduleId - the unique identifier of the scheduled lease renewal.
   * @returns true if the lease renewal was successfully cancelled; false otherwise.
   */
  cancel(scheduleId: number): Promise<boolean>;

  /**
   * Cancels all scheduled lease renewals.
   * @returns a map of the unique identifiers of the scheduled lease renewals and their cancellation status.
   */
  cancelAll(): Promise<Map<number, boolean>>;

  /**
   * Calculates the delay before the next lease renewal.
   * @param lease - the lease to be renewed.
   * @returns the delay in milliseconds.
   */
  calculateRenewalDelay(lease: Lease): Duration;
}
