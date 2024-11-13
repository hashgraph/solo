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
import { it, describe, before, after } from 'mocha'
import { ConfigManager, logging } from '../../../../src/core/index.ts'
import { K8 } from '../../../../src/core/k8.ts'
import { MINUTES, SECONDS } from '../../../../src/core/constants.js'
import { expect } from 'chai'
import { Lease } from '../../../../src/core/lease.js'
import { LeaseHolder } from '../../../../src/core/lease_holder.js'
import { sleep } from '../../../../src/core/helpers.ts'
import { IntervalLeaseRenewalService } from '../../../../src/core/lease_renewal.js'
import { type V1Lease } from '@kubernetes/client-node'


const defaultTimeout = 2 * MINUTES

describe('LeaseRenewalService', async function () {
    process.env.SOLO_LEASE_DURATION = String(4)

    const testLogger = logging.NewLogger('debug', true)
    const configManager = new ConfigManager(testLogger)
    const k8 = new K8(configManager, testLogger)
    const testNamespace = 'lease-e2e'
    const renewalService = new IntervalLeaseRenewalService()

    before(async function () {
        this.timeout(defaultTimeout)
        if (await k8.hasNamespace(testNamespace)) {
            await k8.deleteNamespace(testNamespace)
            await sleep(500)
        }

        await k8.createNamespace(testNamespace)
    })

    after(async function () {
        this.timeout(defaultTimeout)
        await k8.deleteNamespace(testNamespace)
    })

    it('acquired leases should be scheduled', async function () {
        const lease = new Lease(k8, renewalService, LeaseHolder.default(), testNamespace)
        await lease.acquire()
        expect(lease.ScheduleId).to.not.be.null
        expect(await renewalService.isScheduled(lease.ScheduleId)).to.be.true

        await lease.release()
        expect(lease.ScheduleId).to.be.null
        expect(await renewalService.isScheduled(lease.ScheduleId)).to.be.false
    })

    it('acquired leases should be renewed', async function () {
        this.timeout(defaultTimeout)

        const lease = new Lease(k8, renewalService, LeaseHolder.default(), testNamespace)
        await lease.acquire()
        expect(lease.ScheduleId).to.not.be.null
        expect(await renewalService.isScheduled(lease.ScheduleId)).to.be.true

        // @ts-ignore
        let remoteObject: V1Lease = await lease.retrieveLease()
        expect(remoteObject).to.not.be.null
        expect(remoteObject?.spec?.renewTime).to.be.undefined
        expect(remoteObject?.spec?.acquireTime).to.not.be.undefined
        expect(remoteObject?.spec?.acquireTime).to.not.be.null

        const acquireTime = new Date(remoteObject?.spec?.acquireTime).valueOf()
        expect(acquireTime).to.be.greaterThan(0)

        await sleep(lease.DurationSeconds * SECONDS)
        // @ts-ignore
        remoteObject = await lease.retrieveLease()
        expect(remoteObject).to.not.be.null
        expect(remoteObject?.spec?.renewTime).to.not.be.undefined
        expect(remoteObject?.spec?.renewTime).to.not.be.null

        const renewTime = new Date(remoteObject?.spec?.renewTime).valueOf()
        expect(renewTime).to.be.greaterThan(acquireTime)

        await lease.release()
        expect(lease.ScheduleId).to.be.null
        expect(await renewalService.isScheduled(lease.ScheduleId)).to.be.false
    })

    it('acquired leases with cancelled schedules should not be renewed', async function () {
        this.timeout(defaultTimeout)

        const lease = new Lease(k8, renewalService, LeaseHolder.default(), testNamespace)
        await lease.acquire()
        expect(lease.ScheduleId).to.not.be.null
        expect(await renewalService.isScheduled(lease.ScheduleId)).to.be.true

        expect(await renewalService.cancel(lease.ScheduleId)).to.be.true
        expect(await renewalService.isScheduled(lease.ScheduleId)).to.be.false


        // @ts-ignore
        let remoteObject: V1Lease = await lease.retrieveLease(k8)
        expect(remoteObject).to.not.be.null
        expect(remoteObject?.spec?.renewTime).to.be.undefined
        expect(remoteObject?.spec?.acquireTime).to.not.be.undefined
        expect(remoteObject?.spec?.acquireTime).to.not.be.null

        const acquireTime = new Date(remoteObject?.spec?.acquireTime).valueOf()
        expect(acquireTime).to.be.greaterThan(0)

        await sleep(lease.DurationSeconds * SECONDS)
        // @ts-ignore
        remoteObject = await lease.retrieveLease()
        expect(remoteObject).to.not.be.null
        expect(remoteObject?.spec?.renewTime).to.be.undefined

        await lease.release()
        expect(lease.ScheduleId).to.be.null
        expect(await renewalService.isScheduled(lease.ScheduleId)).to.be.false
    })
})
