/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type LeaseService, type LeaseRenewalService} from '../../../../src/core/lease/lease_service.js';
import {Duration} from '../../../../src/core/time/duration.js';

export class NoopLeaseRenewalService implements LeaseRenewalService {
  private readonly buffer: SharedArrayBuffer;
  private readonly counter: Uint32Array;

  public constructor() {
    this.buffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    this.counter = new Uint32Array(this.buffer);
    Atomics.store(this.counter, 0, 1);
  }

  public async isScheduled(scheduleId: number): Promise<boolean> {
    return scheduleId > 0;
  }

  public async schedule(lease: LeaseService): Promise<number> {
    return Atomics.add(this.counter, 0, 1);
  }

  public async cancel(scheduleId: number): Promise<boolean> {
    return true;
  }

  public async cancelAll(): Promise<Map<number, boolean>> {
    return new Map<number, boolean>();
  }

  public calculateRenewalDelay(lease: LeaseService): Duration {
    return Duration.ofSeconds(10);
  }
}
