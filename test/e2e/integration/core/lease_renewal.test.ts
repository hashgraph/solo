/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, before, after} from 'mocha';
import {ConfigManager} from '../../../../src/core/config_manager.js';
import * as logging from '../../../../src/core/logging.js';
import type K8 from '../../../../src/core/kube/k8.js';
import {expect} from 'chai';
import {IntervalLease} from '../../../../src/core/lease/interval_lease.js';
import {LeaseHolder} from '../../../../src/core/lease/lease_holder.js';
import {sleep} from '../../../../src/core/helpers.js';
import {IntervalLeaseRenewalService} from '../../../../src/core/lease/interval_lease_renewal.js';
import {type V1Lease} from '@kubernetes/client-node';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const leaseDuration = 4;

describe('LeaseRenewalService', async () => {
  const testLogger = logging.NewLogger('debug', true);
  const configManager = container.resolve(ConfigManager);
  const k8 = container.resolve('K8') as K8;
  const renewalService = container.resolve(IntervalLeaseRenewalService);
  const testNamespace = 'lease-renewal-e2e';

  before(async function () {
    this.timeout(defaultTimeout);
    if (await k8.hasNamespace(testNamespace)) {
      await k8.deleteNamespace(testNamespace);
      await sleep(Duration.ofSeconds(5));
    }

    await k8.createNamespace(testNamespace);
  });

  after(async function () {
    this.timeout(defaultTimeout);
    await k8.deleteNamespace(testNamespace);
  });

  it('acquired leases should be scheduled', async () => {
    const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);
    await lease.acquire();
    expect(lease.scheduleId).to.not.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true;

    await lease.release();
    expect(lease.scheduleId).to.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;
  });

  it('acquired leases should be renewed', async function () {
    this.timeout(defaultTimeout);

    const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);
    await lease.acquire();
    expect(lease.scheduleId).to.not.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true;

    // @ts-ignore
    let remoteObject: V1Lease = await lease.retrieveLease();
    expect(remoteObject).to.not.be.null;
    expect(remoteObject?.spec?.renewTime).to.be.undefined;
    expect(remoteObject?.spec?.acquireTime).to.not.be.undefined;
    expect(remoteObject?.spec?.acquireTime).to.not.be.null;

    const acquireTime = new Date(remoteObject?.spec?.acquireTime).valueOf();
    expect(acquireTime).to.be.greaterThan(0);

    await sleep(Duration.ofSeconds(lease.durationSeconds));
    // @ts-ignore
    remoteObject = await lease.retrieveLease();
    expect(remoteObject).to.not.be.null;
    expect(remoteObject?.spec?.renewTime).to.not.be.undefined;
    expect(remoteObject?.spec?.renewTime).to.not.be.null;

    const renewTime = new Date(remoteObject?.spec?.renewTime).valueOf();
    expect(renewTime).to.be.greaterThan(acquireTime);

    await lease.release();
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;
    expect(lease.scheduleId).to.be.null;
  });

  it('acquired leases with cancelled schedules should not be renewed', async function () {
    this.timeout(defaultTimeout);

    const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);
    await lease.acquire();
    expect(lease.scheduleId).to.not.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true;

    expect(await renewalService.cancel(lease.scheduleId)).to.be.true;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;

    // @ts-ignore
    let remoteObject: V1Lease = await lease.retrieveLease(k8);
    expect(remoteObject).to.not.be.null;
    expect(remoteObject?.spec?.renewTime).to.be.undefined;
    expect(remoteObject?.spec?.acquireTime).to.not.be.undefined;
    expect(remoteObject?.spec?.acquireTime).to.not.be.null;

    const acquireTime = new Date(remoteObject?.spec?.acquireTime).valueOf();
    expect(acquireTime).to.be.greaterThan(0);

    await sleep(Duration.ofSeconds(lease.durationSeconds));
    // @ts-ignore
    remoteObject = await lease.retrieveLease();
    expect(remoteObject).to.not.be.null;
    expect(remoteObject?.spec?.renewTime).to.be.undefined;

    await lease.release();
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;
    // expect(lease.scheduleId).to.be.null
  });
});
