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
import { type Lease } from './lease.js'
import { type K8 } from './k8.js'
import { SECONDS } from './constants.js'

export interface LeaseRenewalService {
    isScheduled (scheduleId: number): Promise<boolean>
    schedule (lease: Lease): Promise<number>
    cancel (scheduleId: number): Promise<boolean>
    cancelAll (): Promise<Map<number, boolean>>
}

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
}

export class IntervalLeaseRenewalService implements LeaseRenewalService {
    private readonly scheduledLeases: Map<number, Lease>

    constructor () {
        this.scheduledLeases = new Map<number, Lease>()
    }

    public async isScheduled (scheduleId: number): Promise<boolean> {
        return this.scheduledLeases.has(scheduleId)
    }

    public async schedule (lease: Lease): Promise<number> {
        const renewalDelay = Math.round(lease.DurationSeconds / 2) * SECONDS
        const timeout = setInterval(() => lease.tryRenew(), renewalDelay)
        const scheduleId = Number(timeout)

        this.scheduledLeases.set(scheduleId, lease)
        return scheduleId
    }

    public async cancel (scheduleId: number): Promise<boolean> {
        if (!scheduleId) return false

        if (this.scheduledLeases.has(scheduleId)) {
            clearInterval(scheduleId)
        }

        return this.scheduledLeases.delete(scheduleId)
    }

    public async cancelAll (): Promise<Map<number, boolean>> {
        const result = new Map<number, boolean>()
        const keys = Array.from(this.scheduledLeases.keys())

        for (const k of keys) {
            result.set(k, await this.cancel(k))
        }

        return result
    }
}
