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
import {type Lease, type LeaseRenewalService} from './lease.js';
import {Duration} from '../time/duration.js';
import {injectable} from 'tsyringe-neo';

/**
 * Implements a lease renewal service which utilizes a setInterval() based approach to renew leases at regular intervals.
 * The renewal delay is calculated as half the duration of the lease in seconds.
 */
@injectable()
export class IntervalLeaseRenewalService implements LeaseRenewalService {
  /** The internal registry used to track all non-cancelled lease renewals. */
  private readonly _scheduledLeases: Map<number, Lease>;

  /**
   * Constructs a new interval lease renewal service.
   */
  constructor() {
    this._scheduledLeases = new Map<number, Lease>();
  }

  /**
   * Determines if a lease renewal is scheduled.
   * This implementation uses the internal registry to track all non-cancelled lease renewals.
   *
   * @param scheduleId - the unique identifier of the scheduled lease renewal.
   * @returns true if the lease renewal is scheduled; false otherwise.
   */
  public async isScheduled(scheduleId: number): Promise<boolean> {
    return this._scheduledLeases.has(scheduleId);
  }

  /**
   * Schedules a lease renewal.
   * This implementation uses the setInterval() method to renew the lease at regular intervals.
   *
   * @param lease - the lease to be renewed.
   * @returns the unique identifier of the scheduled lease renewal. The unique identifier is the ID of the setInterval() timeout.
   */
  public async schedule(lease: Lease): Promise<number> {
    const renewalDelay = this.calculateRenewalDelay(lease);
    const timeout = setInterval(() => lease.tryRenew(), renewalDelay.toMillis());
    const scheduleId = Number(timeout);

    this._scheduledLeases.set(scheduleId, lease);
    return scheduleId;
  }

  /**
   * Cancels a scheduled lease renewal.
   * This implementation uses the clearInterval() method to cancel the scheduled lease renewal.
   * Due to the nature of the setInterval()/clearInterval() methods, the scheduled event may still fire at least once
   * after the cancellation.
   *
   * @param scheduleId - the unique identifier of the scheduled lease renewal. The unique identifier is the ID of the setInterval() timeout.
   * @returns true if the lease renewal was previously scheduled; false otherwise.
   */
  public async cancel(scheduleId: number): Promise<boolean> {
    if (!scheduleId) return false;

    if (this._scheduledLeases.has(scheduleId)) {
      clearInterval(scheduleId);
    }

    return this._scheduledLeases.delete(scheduleId);
  }

  /**
   * Cancels all scheduled lease renewals.
   * This implementation cancels all scheduled lease renewals by iterating over the internal registry and clearing each timeout.
   * @returns a map of the unique identifiers of the scheduled lease renewals and their cancellation status.
   */
  public async cancelAll(): Promise<Map<number, boolean>> {
    const result = new Map<number, boolean>();
    const keys = Array.from(this._scheduledLeases.keys());

    for (const k of keys) {
      result.set(k, await this.cancel(k));
    }

    return result;
  }

  /**
   * Calculates the delay before the next lease renewal.
   * This implementation calculates the renewal delay as half the duration of the lease.
   *
   * @param lease - the lease to be renewed.
   * @returns the delay in milliseconds.
   */
  public calculateRenewalDelay(lease: Lease): Duration {
    return Duration.ofSeconds(lease.durationSeconds * 0.5);
  }
}
