/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, before, after} from 'mocha';
import {type K8Factory} from '../../../../src/core/kube/k8_factory.js';
import {expect} from 'chai';
import {IntervalLease} from '../../../../src/core/lease/interval_lease.js';
import {LeaseHolder} from '../../../../src/core/lease/lease_holder.js';
import {sleep} from '../../../../src/core/helpers.js';
import {type V1Lease} from '@kubernetes/client-node';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/core/kube/resources/namespace/namespace_name.js';
import {InjectTokens} from '../../../../src/core/dependency_injection/inject_tokens.js';
import {type LeaseRenewalService} from '../../../../src/core/lease/lease.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const leaseDuration = 4;

describe('LeaseRenewalService', async () => {
  const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory) as K8Factory;
  const renewalService: LeaseRenewalService = container.resolve(InjectTokens.LeaseRenewalService);
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
    const lease = new IntervalLease(
      k8Factory,
      renewalService,
      LeaseHolder.default(),
      testNamespace,
      null,
      leaseDuration,
    );
    await lease.acquire();
    expect(lease.scheduleId).to.not.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true;

    await lease.release();
    expect(lease.scheduleId).to.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;
  });

  it('acquired leases should be renewed', async function () {
    this.timeout(defaultTimeout);

    const lease = new IntervalLease(
      k8Factory,
      renewalService,
      LeaseHolder.default(),
      testNamespace,
      null,
      leaseDuration,
    );
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

    const lease = new IntervalLease(
      k8Factory,
      renewalService,
      LeaseHolder.default(),
      testNamespace,
      null,
      leaseDuration,
    );
    await lease.acquire();
    expect(lease.scheduleId).to.not.be.null;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.true;

    expect(await renewalService.cancel(lease.scheduleId)).to.be.true;
    expect(await renewalService.isScheduled(lease.scheduleId)).to.be.false;

    // @ts-ignore
    let remoteObject: V1Lease = await lease.retrieveLease(k8Factory);
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
