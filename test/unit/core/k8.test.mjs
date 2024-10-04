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
import sinon from 'sinon'
import { expect } from 'chai'
import { describe, it, after, before } from 'mocha'

import { constants, K8 } from '../../../src/core/index.mjs'
import { getTestConfigManager, testLogger } from '../../test_util.js'
import { flags } from '../../../src/commands/index.mjs'

/**
 * @param {K8} k8
 * @param {number} numOfFailures
 * @param {*} result
 */
function listNamespacedPodMockSetup (k8, numOfFailures, result) {
  const stub = sinon.stub(k8.kubeClient, 'listNamespacedPod')
  for (let i = 0; i < numOfFailures - 1; i++) {
    stub.onCall(i).resolves({ body: { items: [] } })
  }
  stub.onCall(numOfFailures - 1).resolves({ body: { items: result } })
}

const defaultTimeout = 20_000

describe('K8 Unit Tests', function () {
  this.timeout(defaultTimeout)

  const argv = { }
  const expectedResult = [
    {
      metadata: { name: 'pod' },
      status: {
        phase: constants.POD_PHASE_RUNNING,
        conditions: [{
          type: constants.POD_CONDITION_READY,
          status: constants.POD_CONDITION_STATUS_TRUE
        }]
      }
    }
  ]

  /** @type {K8} */ let k8
  /** @type {sinon.SinonStub} */ let k8InitSpy
  /** @type {sinon.SinonStub} */ let k8GetPodsByLabelSpy

  before(() => {
    argv[flags.namespace.name] = 'namespace'
    const configManager = getTestConfigManager('k8-solo.yaml')
    configManager.update(argv, true)

    k8 = new K8(configManager, testLogger)

    k8InitSpy = sinon.stub(K8.prototype, 'init').callsFake(() => {})
    k8GetPodsByLabelSpy = sinon.stub(K8.prototype, 'getPodsByLabel').resolves(expectedResult)

    k8.kubeClient = {
      listNamespacedPod: sinon.stub(),
      deleteNamespacedPod: sinon.stub()
    }
  })

  after(() => {
    k8InitSpy.restore()
    k8GetPodsByLabelSpy.restore()
  })

  it('waitForPods with first time failure, later success', async () => {
    const maxNumOfFailures = 500
    listNamespacedPodMockSetup(k8, maxNumOfFailures, expectedResult)

    const result = await k8.waitForPods([constants.POD_PHASE_RUNNING], ['labels'], 1, maxNumOfFailures, 0)
    expect(result).to.deep.equal(expectedResult)
  })

  it('waitForPodConditions with first time failure, later success', async () => {
    const maxNumOfFailures = 500
    listNamespacedPodMockSetup(k8, maxNumOfFailures, expectedResult)

    const result = await k8.waitForPodConditions(K8.PodReadyCondition, ['labels'], 1, maxNumOfFailures, 0)
    expect(result).not.to.be.null
    expect(result[0]).to.deep.equal(expectedResult[0])
  })

  it('waitForPodConditions with partial pod data', async () => {
    const expectedResult = [
      {
        metadata: { name: 'pod' }
      }
    ]

    const maxNumOfFailures = 5
    listNamespacedPodMockSetup(k8, maxNumOfFailures, expectedResult)

    try {
      await k8.waitForPodConditions(K8.PodReadyCondition, ['labels'], 1, maxNumOfFailures, 0)
    } catch (e) {
      expect(e).not.to.be.null
      expect(e.message).to.contain('Expected number of pod (1) not found for labels: labels, phases: Running [attempts = ')
    }
  })

  it('waitForPodConditions with no conditions', async () => {
    const expectedResult = [
      {
        metadata: { name: 'pod' },
        status: {
          phase: constants.POD_PHASE_RUNNING
        }
      }
    ]

    const maxNumOfFailures = 5
    listNamespacedPodMockSetup(k8, maxNumOfFailures, expectedResult)

    try {
      await k8.waitForPodConditions(K8.PodReadyCondition, ['labels'], 1, maxNumOfFailures, 0)
    } catch (e) {
      expect(e).not.to.be.null
      expect(e.message).to.contain('Expected number of pod (1) not found for labels: labels, phases: Running [attempts = ')
    }
  })
})
