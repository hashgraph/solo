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
import { type Lease } from './lease.ts'
import { SECONDS } from '../constants.ts'

export interface LeaseRenewalService {
    isScheduled (scheduleId: number): Promise<boolean>
    schedule (lease: Lease): Promise<number>
    cancel (scheduleId: number): Promise<boolean>
    cancelAll (): Promise<Map<number, boolean>>
    calculateRenewalDelay (lease: Lease): number
}

export class IntervalLeaseRenewalService implements LeaseRenewalService {
    private readonly _scheduledLeases: Map<number, Lease>

    constructor () {
        this._scheduledLeases = new Map<number, Lease>()
    }

    public async isScheduled (scheduleId: number): Promise<boolean> {
        return this._scheduledLeases.has(scheduleId)
    }

    public async schedule (lease: Lease): Promise<number> {
        const renewalDelay = this.calculateRenewalDelay(lease)
        const timeout = setInterval(() => lease.tryRenew(), renewalDelay)
        const scheduleId = Number(timeout)

        this._scheduledLeases.set(scheduleId, lease)
        return scheduleId
    }

    public async cancel (scheduleId: number): Promise<boolean> {
        if (!scheduleId) return false

        if (this._scheduledLeases.has(scheduleId)) {
            clearInterval(scheduleId)
        }

        return this._scheduledLeases.delete(scheduleId)
    }

    public async cancelAll (): Promise<Map<number, boolean>> {
        const result = new Map<number, boolean>()
        const keys = Array.from(this._scheduledLeases.keys())

        for (const k of keys) {
            result.set(k, await this.cancel(k))
        }

        return result
    }

    public calculateRenewalDelay (lease: Lease): number {
        return Math.round(lease.durationSeconds * 0.5) * SECONDS
    }
}
