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
import type { Lease } from '../../../../src/core/lease/lease.js'
import { type LeaseRenewalService } from '../../../../src/core/lease/lease_renewal.js'

export class NoopLeaseRenewalService implements LeaseRenewalService {
    private readonly buffer: SharedArrayBuffer
    private readonly counter: Uint32Array

    public constructor () {
        this.buffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT)
        this.counter = new Uint32Array(this.buffer)
        Atomics.store(this.counter, 0, 1)
    }

    public async isScheduled (scheduleId: number): Promise<boolean> {
        return scheduleId > 0
    }

    public async schedule (lease: Lease): Promise<number> {
        return Atomics.add(this.counter, 0, 1)
    }

    public async cancel (scheduleId: number): Promise<boolean> {
        return true
    }

    public async cancelAll (): Promise<Map<number, boolean>> {
        return new Map<number, boolean>()
    }

    public calculateRenewalDelay (lease: Lease): number {
        return 10
    }
}
