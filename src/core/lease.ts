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
import { MissingArgumentError, SoloError } from './errors.js'
import { type V1Lease } from '@kubernetes/client-node'
import { type K8 } from './k8.js'
import { SECONDS } from './constants.js'
import { LeaseHolder } from './lease_holder.js'
import { LeaseAcquisitionError, LeaseRelinquishmentError } from './lease_errors.js'
import { type LeaseRenewalService } from './lease_renewal.ts'

export class Lease {
    public static readonly DEFAULT_LEASE_DURATION = 20

    private readonly leaseName: string
    private readonly durationSeconds: number

    private scheduleId: number | null = null

    public constructor (private readonly client: K8,
                        private readonly renewalService: LeaseRenewalService,
                        private readonly leaseHolder: LeaseHolder,
                        private readonly namespace: string,
                        leaseName: string = null) {
        if (!client) throw new MissingArgumentError('client is required')
        if (!renewalService) throw new MissingArgumentError('renewalService is required')
        if (!leaseHolder) throw new MissingArgumentError('leaseHolder is required')
        if (!namespace) throw new MissingArgumentError('namespace is required')

        if (!leaseName) {
            this.leaseName = this.namespace
        }

        this.durationSeconds = +process.env.SOLO_LEASE_DURATION || Lease.DEFAULT_LEASE_DURATION
    }

    public get LeaseName (): string {
        return this.leaseName
    }

    public get LeaseHolder (): LeaseHolder {
        return this.leaseHolder
    }

    public get Namespace (): string {
        return this.namespace
    }

    public get DurationSeconds (): number {
        return this.durationSeconds
    }

    public get ScheduleId (): number | null {
        return this.scheduleId
    }

    public async acquire (): Promise<void> {
        const lease = await this.retrieveLease()

        if (!lease || Lease.expired(lease) || this.heldBySameProcess(lease)) {
            return this.createOrRenewLease(lease)
        }

        const otherHolder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity)

        if (this.heldBySameIdentity(lease) && !otherHolder.isProcessAlive()) {
            return await this.transferLease(lease)
        }

        throw new LeaseAcquisitionError(`lease already acquired by '${otherHolder.Username}' on the ` +
            `'${otherHolder.Hostname}' machine (PID: '${otherHolder.ProcessId}')`, null,
            { self: this.leaseHolder.toObject(), other: otherHolder.toObject() })
    }

    public async tryAcquire (): Promise<boolean> {
        try {
            await this.acquire()
            return true
        } catch (e: SoloError | any) {
            return false
        }
    }

    public async renew (): Promise<void> {
        const lease = await this.retrieveLease()

        if (!lease || this.heldBySameProcess(lease)) {
            return await this.createOrRenewLease(lease)
        }

        throw new LeaseAcquisitionError(`lease already acquired by '${this.leaseHolder.Username}' on the ` +
            `'${this.leaseHolder.Hostname}' machine (PID: '${this.leaseHolder.ProcessId}')`, null,
            { self: this.leaseHolder.toObject(), other: this.leaseHolder.toObject() })
    }

    public async tryRenew (): Promise<boolean> {
        try {
            await this.renew()
            return true
        } catch (e: SoloError | any) {
            return false
        }
    }

    public async release (): Promise<void> {
        const lease = await this.retrieveLease()

        if (this.ScheduleId) {
            await this.renewalService.cancel(this.ScheduleId)
            this.scheduleId = null
        }

        if (!lease) {
            return
        }

        const otherHolder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity)

        if (this.heldBySameProcess(lease) || Lease.expired(lease)) {
            return await this.deleteLease()
        }

        throw new LeaseRelinquishmentError(`lease already acquired by '${otherHolder.Username}' on the ` +
            `'${otherHolder.Hostname}' machine (PID: '${otherHolder.ProcessId}')`, null,
            { self: this.leaseHolder.toObject(), other: otherHolder.toObject() })
    }

    public async tryRelease (): Promise<boolean> {
        try {
            await this.release()
            return true
        } catch (e: SoloError | any) {
            return false
        }
    }

    public async isAcquired (): Promise<boolean> {
        const lease = await this.retrieveLease()
        return !!lease && !Lease.expired(lease) && this.heldBySameProcess(lease)
    }

    public async isExpired (): Promise<boolean> {
        const lease = await this.retrieveLease()
        return !!lease && Lease.expired(lease)
    }

    private async retrieveLease (): Promise<V1Lease> {
        try {
            return await this.client.readNamespacedLease(this.LeaseName, this.Namespace)
        } catch (e: any) {
            if (e.meta.statusCode !== 404) {
                throw new LeaseAcquisitionError('failed to read existing leases, unexpected server response of' +
                    `'${e.meta.statusCode}' received`, e)
            }
        }

        return null
    }

    private async createOrRenewLease (lease: V1Lease): Promise<void> {
        try {
            if (!lease) {
                await this.client.createNamespacedLease(this.LeaseName, this.Namespace, this.LeaseHolder.toJson(), this.DurationSeconds)
            } else {
                await this.client.renewNamespaceLease(this.LeaseName, this.Namespace, lease)
            }

            if (!this.scheduleId) {
                this.scheduleId = await this.renewalService.schedule(this)
            }
        } catch (e: any) {
            throw new LeaseAcquisitionError(`failed to create or renew the lease named '${this.LeaseName}' in the ` +
                `'${this.Namespace}' namespace`, e)
        }
    }

    private async transferLease (lease: V1Lease): Promise<void> {
        try {
            await this.client.transferNamespaceLease(lease, this.LeaseHolder.toJson())

            if (!this.scheduleId) {
                this.scheduleId = await this.renewalService.schedule(this)
            }
        } catch (e: any) {
            throw new LeaseAcquisitionError(`failed to transfer the lease named '${this.LeaseName}' in the ` +
                `'${this.Namespace}' namespace`, e)
        }
    }

    private async deleteLease (): Promise<void> {
        try {
            await this.client.deleteNamespacedLease(this.LeaseName, this.Namespace)
        } catch (e: any) {
            throw new LeaseRelinquishmentError(`failed to delete the lease named '${this.LeaseName}' in the ` +
                `'${this.Namespace}' namespace`, e)
        }
    }

    private static expired (lease: V1Lease): boolean {
        const now = Date.now()
        const durationSec = lease.spec.leaseDurationSeconds || Lease.DEFAULT_LEASE_DURATION
        const lastRenewal = lease.spec?.renewTime || lease.spec?.acquireTime
        const deltaSec = (now - new Date(lastRenewal).valueOf()) / SECONDS
        return deltaSec > durationSec
    }

    private heldBySameProcess (lease: V1Lease): boolean {
        const holder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity)
        return this.LeaseHolder.equals(holder)
    }

    private heldBySameIdentity (lease: V1Lease): boolean {
        const holder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity)
        return this.LeaseHolder.isSameIdentity(holder)
    }
}

