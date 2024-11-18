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
import { MissingArgumentError, SoloError } from '../errors.ts'
import { type V1Lease } from '@kubernetes/client-node'
import { type K8 } from '../k8.ts'
import { SECONDS } from '../constants.ts'
import { LeaseHolder } from './lease_holder.ts'
import { LeaseAcquisitionError, LeaseRelinquishmentError } from './lease_errors.ts'
import { type LeaseRenewalService } from './lease_renewal.ts'
import { sleep } from '../helpers.ts'

export class Lease {
    /** The default duration in seconds for which the lease is to be held before being considered expired. */
    public static readonly DEFAULT_LEASE_DURATION = 20

    /** The holder of the lease. */
    private readonly _leaseHolder: LeaseHolder

    /** The namespace which contains the lease. */
    private readonly _namespace: string

    /** The name of the lease. */
    private readonly _leaseName: string

    /** The duration in seconds for which the lease is to be held. */
    private readonly _durationSeconds: number

    /** The identifier of the scheduled lease renewal. */
    private _scheduleId: number | null = null

    /**
     * @param client - Injected kubernetes client need by the methods to create, renew, and delete leases.
     * @param renewalService - Injected lease renewal service need to support automatic (background) lease renewals.
     * @param leaseHolder - The holder of the lease.
     * @param namespace - The namespace in which the lease is to be acquired.
     * @param leaseName - The name of the lease to be acquired.
     * @param durationSeconds - The duration in seconds for which the lease is to be held.
     */
    public constructor (private readonly client: K8,
                        private readonly renewalService: LeaseRenewalService,
                        leaseHolder: LeaseHolder,
                        namespace: string,
                        leaseName: string | null = null,
                        durationSeconds: number | null = null) {
        if (!client) throw new MissingArgumentError('client is required')
        if (!renewalService) throw new MissingArgumentError('renewalService is required')
        if (!leaseHolder) throw new MissingArgumentError('_leaseHolder is required')
        if (!namespace) throw new MissingArgumentError('_namespace is required')

        this._leaseHolder = leaseHolder
        this._namespace = namespace

        if (!leaseName) {
            this._leaseName = this._namespace
        }

        // In most production cases, the environment variable should be preferred over the constructor argument.
        if (!durationSeconds) {
            this._durationSeconds = +process.env.SOLO_LEASE_DURATION || Lease.DEFAULT_LEASE_DURATION
        } else {
            this._durationSeconds = durationSeconds
        }
    }

    public get leaseName (): string {
        return this._leaseName
    }

    public get leaseHolder (): LeaseHolder {
        return this._leaseHolder
    }

    public get namespace (): string {
        return this._namespace
    }

    public get durationSeconds (): number {
        return this._durationSeconds
    }

    public get scheduleId (): number | null {
        return this._scheduleId
    }

    private set scheduleId (scheduleId: number | null) {
        this._scheduleId = scheduleId
    }

    public async acquire (): Promise<void> {
        const lease = await this.retrieveLease()

        if (!lease || Lease.checkExpiration(lease) || this.heldBySameProcess(lease)) {
            return this.createOrRenewLease(lease)
        }

        const otherHolder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity)

        if (this.heldBySameMachineIdentity(lease) && !otherHolder.isProcessAlive()) {
            return await this.transferLease(lease)
        }

        throw new LeaseAcquisitionError(`lease already acquired by '${otherHolder.username}' on the ` +
            `'${otherHolder.hostname}' machine (PID: '${otherHolder.processId}')`, null,
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

        throw new LeaseAcquisitionError(`lease already acquired by '${this._leaseHolder.username}' on the ` +
            `'${this._leaseHolder.hostname}' machine (PID: '${this._leaseHolder.processId}')`, null,
            { self: this._leaseHolder.toObject(), other: this._leaseHolder.toObject() })
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

        if (this.scheduleId) {
            await this.renewalService.cancel(this.scheduleId)
            // Needed to ensure any pending renewals are truly cancelled before proceeding to delete the Lease.
            // This is required because clearInterval() is not guaranteed to abort any pending interval.
            await sleep(this.renewalService.calculateRenewalDelay(this))
        }

        this.scheduleId = null

        if (!lease) {
            return
        }

        const otherHolder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity)

        if (this.heldBySameProcess(lease) || Lease.checkExpiration(lease)) {
            return await this.deleteLease()
        }

        throw new LeaseRelinquishmentError(`lease already acquired by '${otherHolder.username}' on the ` +
            `'${otherHolder.hostname}' machine (PID: '${otherHolder.processId}')`, null,
            { self: this._leaseHolder.toObject(), other: otherHolder.toObject() })
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
        return !!lease && !Lease.checkExpiration(lease) && this.heldBySameProcess(lease)
    }

    public async isExpired (): Promise<boolean> {
        const lease = await this.retrieveLease()
        return !!lease && Lease.checkExpiration(lease)
    }

    private async retrieveLease (): Promise<V1Lease> {
        try {
            return await this.client.readNamespacedLease(this.leaseName, this.namespace)
        } catch (e: any) {
            if (!(e instanceof SoloError)) {
                throw new LeaseAcquisitionError(`failed to read the lease named '${this.leaseName}' in the ` +
                    `'${this.namespace}' namespace, caused by: ${e.message}`, e)
            }

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
                await this.client.createNamespacedLease(this.leaseName, this.namespace, this.leaseHolder.toJson(), this.durationSeconds)
            } else {
                await this.client.renewNamespaceLease(this.leaseName, this.namespace, lease)
            }

            if (!this.scheduleId) {
                this.scheduleId = await this.renewalService.schedule(this)
            }
        } catch (e: any) {
            throw new LeaseAcquisitionError(`failed to create or renew the lease named '${this.leaseName}' in the ` +
                `'${this.namespace}' namespace`, e)
        }
    }

    private async transferLease (lease: V1Lease): Promise<void> {
        try {
            await this.client.transferNamespaceLease(lease, this.leaseHolder.toJson())

            if (!this.scheduleId) {
                this.scheduleId = await this.renewalService.schedule(this)
            }
        } catch (e: any) {
            throw new LeaseAcquisitionError(`failed to transfer the lease named '${this.leaseName}' in the ` +
                `'${this.namespace}' namespace`, e)
        }
    }

    private async deleteLease (): Promise<void> {
        try {
            await this.client.deleteNamespacedLease(this.leaseName, this.namespace)
        } catch (e: any) {
            throw new LeaseRelinquishmentError(`failed to delete the lease named '${this.leaseName}' in the ` +
                `'${this.namespace}' namespace`, e)
        }
    }

    private static checkExpiration (lease: V1Lease): boolean {
        const now = Date.now()
        const durationSec = lease.spec.leaseDurationSeconds || Lease.DEFAULT_LEASE_DURATION
        const lastRenewal = lease.spec?.renewTime || lease.spec?.acquireTime
        const deltaSec = (now - new Date(lastRenewal).valueOf()) / SECONDS
        return deltaSec > durationSec
    }

    private heldBySameProcess (lease: V1Lease): boolean {
        const holder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity)
        return this.leaseHolder.equals(holder)
    }

    private heldBySameMachineIdentity (lease: V1Lease): boolean {
        const holder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity)
        return this.leaseHolder.isSameMachineIdentity(holder)
    }
}

