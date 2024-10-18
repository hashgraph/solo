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
import { expect } from 'chai'
import { describe, it, after, before } from 'mocha'
import jest from 'jest-mock'
import * as k8s from '@kubernetes/client-node'
import { flags } from '../../../src/commands/index.mjs'

import { constants, K8 } from '../../../src/core/index.ts'
import { getTestConfigManager, testLogger } from '../../test_util.ts'
import { flags } from '../../../src/commands/index.ts'
import { SECONDS } from '../../../src/core/constants.ts'

function listNamespacedPodMockSetup (k8: K8, numOfFailures: number, result: any) {
  for (let i = 0; i < numOfFailures - 1; i++) { // @ts-ignore
    k8.kubeClient.listNamespacedPod.mockReturnValueOnce(Promise.resolve({
      body: {
        items: []
      }
    }))
  } // @ts-ignore
  k8.kubeClient.listNamespacedPod.mockReturnValueOnce(Promise.resolve({
    body: {
      items: result
    }
  }))
}

const defaultTimeout = 20 * SECONDS

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
  // const k8InitSpy = jest.spyOn(K8.prototype, 'init').mockImplementation(() => {})
  const k8GetPodsByLabelSpy = jest.spyOn(K8.prototype, 'getPodsByLabel').mockResolvedValue(expectedResult)
  let k8: K8

  before(() => {
    argv[flags.namespace.name] = 'namespace'
    const configManager = getTestConfigManager('k8-solo.yaml')
    configManager.update(argv, true)
    k8 = new K8(configManager, testLogger)
    k8.kubeClient = {
      // @ts-ignore
      listNamespacedPod: jest.fn(),
      // @ts-ignore
      deleteNamespacedPod: jest.fn()
    }
  })

  after(() => {
    // k8InitSpy.mockRestore()
    k8GetPodsByLabelSpy.mockRestore()
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
    const expectedResult = [{ metadata: { name: 'pod' } }]

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
  


  it('createClusterRole should be able to create new cluster role', async () => {
    const roleName = 'non-conflicting-cluster-role'
    try {
      const clusterRole = await k8.createClusterRole(roleName)

      expect(clusterRole).toBeInstanceOf(k8s.V1ClusterRole)
    } finally {
      await k8.deleteClusterRole(roleName).catch()
    }
  }, defaultTimeout)

  it('createClusterRole should not be able to create duplicates', async () => {
    const roleName = 'conflicting-cluster-role'
    try {
      await k8.createClusterRole(roleName)
      await k8.createClusterRole(roleName)

      throw new Error('Expected method to throw an error, but it did not')
    } catch (e) {
      expect(e).not.toBeNull()
      expect(e).toBeInstanceOf(FullstackTestingError)
    } finally {
      await k8.deleteClusterRole(roleName).catch()
    }
  }, defaultTimeout)

  it('getClusterRole should throw error if no cluster role is found', async () => {
    const roleName = 'not-found-cluster-role'
    const role = await k8.getClusterRole(roleName)

    expect(role).toBeNull()
  }, defaultTimeout)

  it('getClusterRole should get cluster role if it exists', async () => {
    const roleName = 'found-cluster-name'
    try {
      await k8.createClusterRole(roleName)
      const clusterRole = await k8.getClusterRole(roleName)

      expect(clusterRole).toBeInstanceOf(k8s.V1ClusterRole)
    } finally {
      await k8.deleteClusterRole(roleName).catch()
    }
  }, defaultTimeout)
})
