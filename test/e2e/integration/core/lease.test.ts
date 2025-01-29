/**
 * Copyright (C) 2025 Hedera Hashgraph, LLC
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
import {it, describe, before, after} from 'mocha';
import {ConfigManager} from '../../../../src/core/config_manager.js';
import * as logging from '../../../../src/core/logging.js';
import {K8} from '../../../../src/core/k8.js';
import {expect} from 'chai';
import {IntervalLease} from '../../../../src/core/lease/interval_lease.js';
import {LeaseHolder} from '../../../../src/core/lease/lease_holder.js';
import {sleep} from '../../../../src/core/helpers.js';
import {LeaseRelinquishmentError} from '../../../../src/core/lease/lease_errors.js';
import {NoopLeaseRenewalService} from './noop_lease_renewal_service.test.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const leaseDuration = 4;

describe('Lease', async () => {
  const testLogger = logging.NewLogger('debug', true);
  const configManager = container.resolve(ConfigManager);
  const k8 = container.resolve(K8);
  const testNamespace = 'lease-e2e';
  const renewalService = new NoopLeaseRenewalService();

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
