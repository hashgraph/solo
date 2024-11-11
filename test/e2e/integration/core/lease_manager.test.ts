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
import { it, describe, after } from 'mocha'
import { expect } from 'chai'

import { flags } from '../../../../src/commands/index.ts'
import { e2eTestSuite, getDefaultArgv, TEST_CLUSTER } from '../../../test_util.ts'
import * as version from '../../../../version.ts'
import { LEASE_ACQUIRE_RETRY_TIMEOUT, MAX_LEASE_ACQUIRE_ATTEMPTS, MINUTES } from '../../../../src/core/constants.ts'
import { sleep } from '../../../../src/core/helpers.ts'

const namespace = 'lease-mngr-e2e'
const argv = getDefaultArgv()
argv[flags.namespace.name] = namespace
argv[flags.nodeAliasesUnparsed.name] = 'node1'
argv[flags.clusterName.name] = TEST_CLUSTER
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION
argv[flags.generateGossipKeys.name] = true
argv[flags.generateTlsKeys.name] = true
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined

e2eTestSuite(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, false, (bootstrapResp) => {
  describe('LeaseManager', async () => {
    const k8 = bootstrapResp.opts.k8
    const leaseManager = bootstrapResp.opts.leaseManager

    after(async function () {
      this.timeout(2 * MINUTES)

      await k8.deleteNamespace(namespace)
    })

    it('should be able to create lease and release it', async () => {
      const lease = leaseManager.instantiateLease()
      const title = 'Testing title'
      // @ts-ignore to access private property
      await lease.acquireTask({ title }, title)

      expect(typeof lease.release).to.equal('function')
      await lease.release()
    })

    it('should not be able to create second lease in the same namespace', async () => {
      // Create first lease
      const initialLease = leaseManager.instantiateLease()
      const title = 'Testing title'
      // @ts-ignore to access private property
      await initialLease.acquireTask({ title }, title)

      const blockedLease = leaseManager.instantiateLease()

      try {
        // @ts-ignore to access private property
        await blockedLease.acquireTask({ title }, title, MAX_LEASE_ACQUIRE_ATTEMPTS - 1)

        await sleep(LEASE_ACQUIRE_RETRY_TIMEOUT * 2)
      } catch (e: Error | any) {
        expect(e.message).to.contain('Failed to acquire lease, max attempt reached')
      }

      await initialLease.release()
    }).timeout(3 * MINUTES)
  })
})
