// SPDX-License-Identifier: Apache-2.0

import {type Lock, type LockRenewalService} from '../../../../src/core/lock/lock.js';
import {Duration} from '../../../../src/core/time/duration.js';

export class NoopLeaseRenewalService implements LockRenewalService {
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

  public async schedule(lease: Lock): Promise<number> {
    return Atomics.add(this.counter, 0, 1);
  }

  public async cancel(scheduleId: number): Promise<boolean> {
    return true;
  }

  public async cancelAll(): Promise<Map<number, boolean>> {
    return new Map<number, boolean>();
  }

  public calculateRenewalDelay(lease: Lock): Duration {
    return Duration.ofSeconds(10);
  }
}
