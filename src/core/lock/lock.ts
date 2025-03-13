// SPDX-License-Identifier: Apache-2.0

import {type K8Factory} from '../kube/k8_factory.js';
import {type LockHolder} from './lock_holder.js';
import {type NamespaceName} from '../kube/resources/namespace/namespace_name.js';
import {type Duration} from '../time/duration.js';

export interface Lock {
  readonly k8Factory: K8Factory;
  readonly renewalService: LockRenewalService;
  readonly leaseName: string;
  readonly lockHolder: LockHolder;
  readonly namespace: NamespaceName;
  readonly durationSeconds: number;
  scheduleId: number;

  /**
   * Acquires the lock. If the lock is already acquired, it checks if the lock is expired or held by the same process.
   * If the lock is expired, it creates a new lock. If the lock is held by the same process, it renews the lock.
   * If the lock is held by another process, then an exception is thrown.
   *
   * @throws LeaseAcquisitionError - If the lock is already acquired by another process or an error occurs during acquisition.
   */
  acquire(): Promise<void>;

  /**
   * Attempts to acquire the lock, by calling the acquire method. If an exception is thrown, it is caught and false is returned.
   * If the lock is successfully acquired, true is returned; otherwise, false is returned.
   *
   * @returns true if the lock is successfully acquired; otherwise, false.
   */
  tryAcquire(): Promise<boolean>;

  /**
   * Renews the lock. If the lock is expired or held by the same process, it creates or renews the lock.
   * If the lock is held by another process, then an exception is thrown.
   *
   * @throws LeaseAcquisitionError - If the lock is already acquired by another process or an error occurs during renewal.
   */
  renew(): Promise<void>;

  /**
   * Attempts to renew the lock, by calling the renew method. If an exception is thrown, it is caught and false is returned.
   * If the lock is successfully renewed, true is returned; otherwise, false is returned.
   *
   * @returns true if the lock is successfully renewed; otherwise, false.
   */
  tryRenew(): Promise<boolean>;

  /**
   * Releases the lock. If the lock is expired or held by the same process, it deletes the lock.
   * If the lock is held by another process, then an exception is thrown.
   *
   * @throws LeaseRelinquishmentError - If the lock is already acquired by another process or an error occurs during relinquishment.
   */
  release(): Promise<void>;

  /**
   * Attempts to relock the lock, by calling the relock method. If an exception is thrown, it is caught and false is returned.
   * If the lock is successfully released, true is returned; otherwise, false is returned.
   *
   * @returns true if the lock is successfully released; otherwise, false.
   */
  tryRelease(): Promise<boolean>;

  /**
   * Checks if the lock is acquired. If the lock is acquired and not expired, it returns true; otherwise, false.
   *
   * @returns true if the lock is acquired and not expired; otherwise, false.
   */
  isAcquired(): Promise<boolean>;

  /**
   * Checks if the lock is expired. If the lock is expired, it returns true; otherwise, false.
   * This method does not verify if the lock is acquired by the current process.
   *
   * @returns true if the lock is expired; otherwise, false.
   */
  isExpired(): Promise<boolean>;
}

export interface LockRenewalService {
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
  schedule(lease: Lock): Promise<number>;

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
  calculateRenewalDelay(lease: Lock): Duration;
}
