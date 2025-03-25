// SPDX-License-Identifier: Apache-2.0

import {it, describe, before, after} from 'mocha';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {expect} from 'chai';
import {IntervalLock} from '../../../../src/core/lock/interval-lock.js';
import {LockHolder} from '../../../../src/core/lock/lock-holder.js';
import {sleep} from '../../../../src/core/helpers.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/integration/kube/resources/namespace/namespace-name.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type Lease} from '../../../../src/integration/kube/resources/lease/lease.js';
import {type LockRenewalService} from '../../../../src/core/lock/lock.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const leaseDuration = 4;

describe('LeaseRenewalService', async () => {
  const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory) as K8Factory;
  const renewalService: LockRenewalService = container.resolve(InjectTokens.LockRenewalService);
  const testNamespace = NamespaceName.of('lease-renewal-e2e');

  before(async function () {
    this.timeout(defaultTimeout);
    if (await k8Factory.default().namespaces().has(testNamespace)) {
      await k8Factory.default().namespaces().delete(testNamespace);
      await sleep(Duration.ofSeconds(5));
    }

    await k8Factory.default().namespaces().create(testNamespace);
  });

  after(async function () {
    this.timeout(defaultTimeout);
    await k8Factory.default().namespaces().delete(testNamespace);
  });

  it('acquired leases should be scheduled', async () => {
    const lease = new IntervalLock(k8Factory, renewalService, LockHolder.default(), testNamespace, null, leaseDuration);
    await lease.acquire();
    expect(lease.scheduleId).to.not.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true;

    await lease.release();
    expect(lease.scheduleId).to.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;
  });

  it('acquired leases should be renewed', async function () {
    this.timeout(defaultTimeout);

    const lease = new IntervalLock(k8Factory, renewalService, LockHolder.default(), testNamespace, null, leaseDuration);
    await lease.acquire();
    expect(lease.scheduleId).to.not.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true;

    // @ts-expect-error - accessing private method for testing
    let remoteObject: Lease = await lease.retrieveLease();
    expect(remoteObject).to.not.be.null;
    expect(remoteObject?.renewTime).to.be.undefined;
    expect(remoteObject?.acquireTime).to.not.be.undefined;
    expect(remoteObject?.acquireTime).to.not.be.null;

    const acquireTime = new Date(remoteObject?.acquireTime).valueOf();
    expect(acquireTime).to.be.greaterThan(0);

    await sleep(Duration.ofSeconds(lease.durationSeconds));
    // @ts-expect-error - accessing private method for testing
    remoteObject = await lease.retrieveLease();
    expect(remoteObject).to.not.be.null;
    expect(remoteObject?.renewTime).to.not.be.undefined;
    expect(remoteObject?.renewTime).to.not.be.null;

    const renewTime = new Date(remoteObject?.renewTime).valueOf();
    expect(renewTime).to.be.greaterThan(acquireTime);

    await lease.release();
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;
    expect(lease.scheduleId).to.be.null;
  });

  it('acquired leases with cancelled schedules should not be renewed', async function () {
    this.timeout(defaultTimeout);

    const lease = new IntervalLock(k8Factory, renewalService, LockHolder.default(), testNamespace, null, leaseDuration);
    await lease.acquire();
    expect(lease.scheduleId).to.not.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true;

    expect(await renewalService.cancel(lease.scheduleId)).to.be.true;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;

    // @ts-expect-error - accessing private method for testing
    let remoteObject: Lease = await lease.retrieveLease(k8Factory);
    expect(remoteObject).to.not.be.null;
    expect(remoteObject?.renewTime).to.be.undefined;
    expect(remoteObject?.acquireTime).to.not.be.undefined;
    expect(remoteObject?.acquireTime).to.not.be.null;

    const acquireTime = new Date(remoteObject?.acquireTime).valueOf();
    expect(acquireTime).to.be.greaterThan(0);

    await sleep(Duration.ofSeconds(lease.durationSeconds));
    // @ts-expect-error - accessing private method for testing
    remoteObject = await lease.retrieveLease();
    expect(remoteObject).to.not.be.null;
    expect(remoteObject?.renewTime).to.be.undefined;

    await lease.release();
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;
    // expect(lease.scheduleId).to.be.null
  });
});
