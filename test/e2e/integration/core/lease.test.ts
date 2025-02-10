/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, before, after} from 'mocha';
import {type ConfigManager} from '../../../../src/core/config_manager.js';
import * as logging from '../../../../src/core/logging.js';
import {type K8} from '../../../../src/core/kube/k8.js';
import {expect} from 'chai';
import {IntervalLease} from '../../../../src/core/lease/interval_lease.js';
import {LeaseHolder} from '../../../../src/core/lease/lease_holder.js';
import {sleep} from '../../../../src/core/helpers.js';
import {LeaseRelinquishmentError} from '../../../../src/core/lease/lease_errors.js';
import {NoopLeaseRenewalService} from './noop_lease_renewal_service.test.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {NamespaceName} from '../../../../src/core/kube/resources/namespace/namespace_name.js';
import {InjectTokens} from '../../../../src/core/dependency_injection/inject_tokens.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const leaseDuration = 4;

describe('Lease', async () => {
  const testLogger = logging.NewLogger('debug', true);
  const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  const k8: K8 = container.resolve(InjectTokens.K8);
  const testNamespace = NamespaceName.of('lease-e2e');
  const renewalService = new NoopLeaseRenewalService();

  before(async function () {
    this.timeout(defaultTimeout);
    if (await k8.namespaces().has(testNamespace)) {
      await k8.namespaces().delete(testNamespace);
      await sleep(Duration.ofSeconds(5));
    }

    await k8.namespaces().create(testNamespace);
  });

  after(async function () {
    this.timeout(defaultTimeout);
    await k8.namespaces().delete(testNamespace);
  });

  describe('acquire and release', async function () {
    this.timeout(defaultTimeout);

    it('non-expired lease', async () => {
      const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);

      await lease.acquire();
      expect(await lease.isAcquired()).to.be.true;

      await lease.release();
      expect(await lease.isAcquired()).to.be.false;
    });

    it('non-expired lease held by another user should not be released', async () => {
      const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);
      const newLease = new IntervalLease(
        k8,
        renewalService,
        LeaseHolder.of('other'),
        testNamespace,
        null,
        leaseDuration,
      );

      await lease.acquire();
      expect(await lease.isAcquired()).to.be.true;
      expect(await lease.isExpired()).to.be.false;

      expect(newLease.release()).to.be.rejectedWith(LeaseRelinquishmentError);
      expect(await lease.isAcquired()).to.be.true;
      expect(await lease.isExpired()).to.be.false;

      await lease.release();
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.false;
    });

    it('expired lease held by another user should be released', async () => {
      const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);
      const newLease = new IntervalLease(
        k8,
        renewalService,
        LeaseHolder.of('other'),
        testNamespace,
        null,
        leaseDuration,
      );

      await lease.acquire();
      expect(await lease.isAcquired()).to.be.true;
      expect(await lease.isExpired()).to.be.false;

      await sleep(Duration.ofSeconds(lease.durationSeconds).plusSeconds(1));
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.true;

      await newLease.release();
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.false;
    });

    it('expired lease should be released', async () => {
      const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);

      await lease.acquire();
      expect(await lease.isAcquired()).to.be.true;

      await sleep(Duration.ofSeconds(lease.durationSeconds).plusSeconds(1));
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.true;

      await lease.release();
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.false;
    });
  });

  describe('tryAcquire and tryRelease', async function () {
    this.timeout(defaultTimeout);

    it('non-expired lease', async () => {
      const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);

      expect(await lease.tryAcquire()).to.be.true;
      expect(await lease.isAcquired()).to.be.true;
      expect(await lease.isExpired()).to.be.false;

      expect(await lease.tryRelease()).to.be.true;
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.false;
    });

    it('non-expired lease held by another user should not be released', async () => {
      const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);
      const newLease = new IntervalLease(
        k8,
        renewalService,
        LeaseHolder.of('other'),
        testNamespace,
        null,
        leaseDuration,
      );

      expect(await lease.tryAcquire()).to.be.true;
      expect(await lease.isAcquired()).to.be.true;
      expect(await lease.isExpired()).to.be.false;

      expect(await newLease.tryRelease()).to.be.false;
      expect(await lease.isAcquired()).to.be.true;
      expect(await lease.isExpired()).to.be.false;

      expect(await lease.tryRelease()).to.be.true;
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.false;
    });

    it('expired lease held by another user should be released', async () => {
      const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);
      const newLease = new IntervalLease(
        k8,
        renewalService,
        LeaseHolder.of('other'),
        testNamespace,
        null,
        leaseDuration,
      );

      expect(await lease.tryAcquire()).to.be.true;
      expect(await lease.isAcquired()).to.be.true;
      expect(await lease.isExpired()).to.be.false;

      await sleep(Duration.ofSeconds(lease.durationSeconds).plusSeconds(1));
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.true;

      expect(await newLease.tryRelease()).to.be.true;
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.false;
    });

    it('expired lease should be released', async () => {
      const lease = new IntervalLease(k8, renewalService, LeaseHolder.default(), testNamespace, null, leaseDuration);

      expect(await lease.tryAcquire()).to.be.true;
      expect(await lease.isAcquired()).to.be.true;
      expect(await lease.isExpired()).to.be.false;

      await sleep(Duration.ofSeconds(lease.durationSeconds).plusSeconds(1));
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.true;

      expect(await lease.tryRelease()).to.be.true;
      expect(await lease.isAcquired()).to.be.false;
      expect(await lease.isExpired()).to.be.false;
    });
  });
});
