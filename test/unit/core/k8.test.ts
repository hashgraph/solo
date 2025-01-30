/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';
import {describe, it, after, before} from 'mocha';
import jest from 'jest-mock';
import * as constants from '../../../src/core/constants.js';
import {K8} from '../../../src/core/k8.js';
import {ConfigManager} from '../../../src/core/config_manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {Duration} from '../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {resetTestContainer} from '../../test_container.js';

function listNamespacedPodMockSetup(k8: K8, numOfFailures: number, result: any) {
  for (let i = 0; i < numOfFailures - 1; i++) {
    // @ts-ignore
    k8.kubeClient.listNamespacedPod.mockReturnValueOnce(
      Promise.resolve({
        body: {
          items: [],
        },
      }),
    );
  } // @ts-ignore
  k8.kubeClient.listNamespacedPod.mockReturnValueOnce(
    Promise.resolve({
      body: {
        items: result,
      },
    }),
  );
}

const defaultTimeout = Duration.ofSeconds(20).toMillis();

describe('K8 Unit Tests', function () {
  this.timeout(defaultTimeout);

  const argv = {};
  const expectedResult = [
    {
      metadata: {name: 'pod'},
      status: {
        phase: constants.POD_PHASE_RUNNING,
        conditions: [
          {
            type: constants.POD_CONDITION_READY,
            status: constants.POD_CONDITION_STATUS_TRUE,
          },
        ],
      },
    },
  ];
  // @ts-ignore
  const k8InitSpy = jest.spyOn(K8.prototype, 'init').mockImplementation(() => {});
  const k8GetPodsByLabelSpy = jest.spyOn(K8.prototype, 'getPodsByLabel').mockResolvedValue(expectedResult);
  let k8: K8;

  before(() => {
    resetTestContainer();
    argv[flags.namespace.name] = 'namespace';
    const configManager = container.resolve(ConfigManager);
    configManager.update(argv);
    k8 = container.resolve(K8);
    k8.kubeClient = {
      // @ts-ignore
      listNamespacedPod: jest.fn(),
      // @ts-ignore
      deleteNamespacedPod: jest.fn(),
    };
  });

  after(() => {
    k8InitSpy.mockRestore();
    k8GetPodsByLabelSpy.mockRestore();
  });

  it('waitForPods with first time failure, later success', async () => {
    const maxNumOfFailures = 500;
    listNamespacedPodMockSetup(k8, maxNumOfFailures, expectedResult);

    const result = await k8.waitForPods([constants.POD_PHASE_RUNNING], ['labels'], 1, maxNumOfFailures, 0);
    expect(result).to.deep.equal(expectedResult);
  });
});
