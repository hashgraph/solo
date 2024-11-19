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
import { MINUTES, SECONDS } from '../../../../src/core/constants.ts'
import { expect } from 'chai'
import { Lease } from '../../../../src/core/lease/lease.ts'
import { LeaseHolder } from '../../../../src/core/lease/lease_holder.ts'
import { sleep } from '../../../../src/core/helpers.ts'
import { IntervalLeaseRenewalService } from '../../../../src/core/lease/lease_renewal.ts'
import { type V1Lease } from '@kubernetes/client-node'


const defaultTimeout = 2 * MINUTES
const leaseDuration = 4

describe('LeaseRenewalService', async function () {
    const testLogger = logging.NewLogger('debug', true)
    const configManager = new ConfigManager(testLogger)
    const k8 = new K8(configManager, testLogger)
    const testNamespace = 'lease-renewal-e2e'
    const renewalService = new IntervalLeaseRenewalService()

    before(async function () {
        this.timeout(defaultTimeout)
        if (await k8.hasNamespace(testNamespace)) {
            await k8.deleteNamespace(testNamespace)
            await sleep(5 * SECONDS)
        }

        await k8.createNamespace(testNamespace)
    })

    after(async function () {
        this.timeout(defaultTimeout)
        await k8.deleteNamespace(testNamespace)
    })

    it('acquired leases should be scheduled', async function () {
        const lease = new Lease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration)
        await lease.acquire()
        expect(lease.scheduleId).to.not.be.null
        expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true

        await lease.release()
        expect(lease.scheduleId).to.be.null
        expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false
    })

    it('acquired leases should be renewed', async function () {
        this.timeout(defaultTimeout)

        const lease = new Lease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration)
        await lease.acquire()
        expect(lease.scheduleId).to.not.be.null
        expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true

        // @ts-ignore
        let remoteObject: V1Lease = await lease.retrieveLease()
        expect(remoteObject).to.not.be.null
        expect(remoteObject?.spec?.renewTime).to.be.undefined
        expect(remoteObject?.spec?.acquireTime).to.not.be.undefined
        expect(remoteObject?.spec?.acquireTime).to.not.be.null

        const acquireTime = new Date(remoteObject?.spec?.acquireTime).valueOf()
        expect(acquireTime).to.be.greaterThan(0)

        await sleep(lease.durationSeconds * SECONDS)
        // @ts-ignore
        remoteObject = await lease.retrieveLease()
        expect(remoteObject).to.not.be.null
        expect(remoteObject?.spec?.renewTime).to.not.be.undefined
        expect(remoteObject?.spec?.renewTime).to.not.be.null

        const renewTime = new Date(remoteObject?.spec?.renewTime).valueOf()
        expect(renewTime).to.be.greaterThan(acquireTime)

        await lease.release()
        expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false
        expect(lease.scheduleId).to.be.null
    })

    it('acquired leases with cancelled schedules should not be renewed', async function () {
        this.timeout(defaultTimeout)

        const lease = new Lease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration)
        await lease.acquire()
        expect(lease.scheduleId).to.not.be.null
        expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true

        expect(await renewalService.cancel(lease.scheduleId)).to.be.true
        expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false


        // @ts-ignore
        let remoteObject: V1Lease = await lease.retrieveLease(k8)
        expect(remoteObject).to.not.be.null
        expect(remoteObject?.spec?.renewTime).to.be.undefined
        expect(remoteObject?.spec?.acquireTime).to.not.be.undefined
        expect(remoteObject?.spec?.acquireTime).to.not.be.null

        const acquireTime = new Date(remoteObject?.spec?.acquireTime).valueOf()
        expect(acquireTime).to.be.greaterThan(0)

        await sleep(lease.durationSeconds * SECONDS)
        // @ts-ignore
        remoteObject = await lease.retrieveLease()
        expect(remoteObject).to.not.be.null
        expect(remoteObject?.spec?.renewTime).to.be.undefined

        await lease.release()
        expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false
        // expect(lease.scheduleId).to.be.null
    })
})
