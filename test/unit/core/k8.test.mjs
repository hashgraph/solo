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
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals'
import { constants, K8 } from '../../../src/core/index.mjs'
import { getTestConfigManager, testLogger } from '../../test_util.js'
import { flags } from '../../../src/commands/index.mjs'

describe('K8 Unit Tests', () => {
  const argv = { }
  const expectedResult = [
    {
      metadata: { name: 'pod' },
      status: {
        phase: constants.POD_PHASE_RUNNING,
        conditions: [
          {
            type: constants.POD_CONDITION_READY,
            status: constants.POD_CONDITION_STATUS_TRUE
          }
        ]
      }
    }
  ]
  const k8InitSpy = jest.spyOn(K8.prototype, 'init').mockImplementation(() => {})
  const k8GetPodsByLabelSpy = jest.spyOn(K8.prototype, 'getPodsByLabel').mockResolvedValue(expectedResult)
  let k8

  beforeAll(() => {
    argv[flags.namespace.name] = 'namespace'
    const configManager = getTestConfigManager('k8-solo.config')
    configManager.update(argv, true)
    k8 = new K8(configManager, testLogger)
    k8.kubeClient = {
      listNamespacedPod: jest.fn(),
      deleteNamespacedPod: jest.fn()
    }
  })

  afterAll(() => {
    k8InitSpy.mockRestore()
    k8GetPodsByLabelSpy.mockRestore()
  })

  it('waitForPods with first time failure, later success', async () => {
    const maxNumOfFailures = 500
    for (let i = 0; i < maxNumOfFailures - 1; i++) {
      k8.kubeClient.listNamespacedPod.mockReturnValueOnce(Promise.resolve({
        body: {
          items: []
        }
      }))
    }
    k8.kubeClient.listNamespacedPod.mockReturnValueOnce(Promise.resolve({
      body: {
        items: expectedResult
      }
    }))

    const result = await k8.waitForPods([constants.POD_PHASE_RUNNING], ['labels'], 1, maxNumOfFailures, 0)
    expect(result).toBe(expectedResult)
  })

  it('waitForPodConditions with first time failure, later success', async () => {
    const maxNumOfFailures = 500
    for (let i = 0; i < maxNumOfFailures - 1; i++) {
      k8.kubeClient.listNamespacedPod.mockReturnValueOnce(Promise.resolve({
        body: {
          items: []
        }
      }))
    }
    k8.kubeClient.listNamespacedPod.mockReturnValueOnce(Promise.resolve({
      body: {
        items: expectedResult
      }
    }))

    const result = await k8.waitForPodConditions(K8.PodReadyCondition, ['labels'], 1, maxNumOfFailures, 0)
    expect(result).not.toBeNull()
    expect(result[0]).toBe(expectedResult[0])
  }, 20000)

  it('recyclePodByLabels with first time failure, later success', async () => {
    const waitForPodMaxAttempts = 120
    const numOfFailures = waitForPodMaxAttempts * 2 - 1
    for (let i = 0; i < numOfFailures; i++) {
      k8.kubeClient.listNamespacedPod.mockReturnValueOnce(Promise.resolve({
        body: {
          items: []
        }
      }))
    }
    k8.kubeClient.listNamespacedPod.mockReturnValueOnce(Promise.resolve({
      body: {
        items: expectedResult
      }
    }))

    const result = await k8.recyclePodByLabels(['labels'], 2, 0, waitForPodMaxAttempts, 0)
    expect(result[0]).toBe(expectedResult[0])
  }, 20000)
})
