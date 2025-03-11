// SPDX-License-Identifier: Apache-2.0

import {type Duration} from '../time/duration.js';
import {type Lock} from './lock.js';

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
