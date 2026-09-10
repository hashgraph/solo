// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {K8ClientPods} from '../../../../src/integration/kube/k8-client/resources/pod/k8-client-pods.js';
import {KubePodNotFoundError} from '../../../../src/integration/kube/errors/kube-pod-not-found-error.js';
import {resetForTest} from '../../../test-container.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';

describe('waitForRunningPhase createdAfter precision', (): void => {
  before((): void => {
    resetForTest();
  });

  // Kubernetes stores creationTimestamp at second precision (milliseconds are always 0).
  // If replacementCreatedAfter = new Date() has sub-second precision, e.g. 12:00:01.342,
  // and a replacement pod is created at 12:00:01.500, Kubernetes records its
  // creationTimestamp as 12:00:01.000. The naive comparison 12:00:01.000 > 12:00:01.342
  // evaluates to false, so the pod is filtered out on every attempt and the call ends with
  // KubePodNotFoundError even though the replacement exists and is Running.
  it('includes a Running pod whose creationTimestamp is second-truncated to the same second as createdAfter', async (): Promise<void> => {
    const secondBoundary: number = Math.floor(Date.now() / 1000) * 1000;

    const rawPod: Record<string, unknown> = {
      metadata: {
        name: 'haproxy-node1-abc',
        namespace: 'test-namespace',
        // Kubernetes second-precision timestamp: milliseconds stripped
        creationTimestamp: new Date(secondBoundary),
      },
      spec: {containers: [{name: 'haproxy'}]},
      status: {
        phase: 'Running',
        containerStatuses: [],
      },
    };

    const listStub: SinonStub = sinon.stub().resolves({items: [rawPod]});
    const pods: K8ClientPods = new K8ClientPods({listNamespacedPod: listStub} as never, {} as never, '');

    // createdAfter is 500 ms into the same second — sub-second precision that
    // Kubernetes cannot represent. Without the fix, pod.creationTimestamp (000 ms)
    // > createdAfter (500 ms) is false and the pod is excluded every attempt.
    const createdAfter: Date = new Date(secondBoundary + 500);

    const result: unknown[] = await pods.waitForRunningPhase(
      NamespaceName.of('test-namespace'),
      ['app=haproxy-node1'],
      3,
      0,
      undefined,
      createdAfter,
    );

    expect(result).to.have.length(1);
  });

  it('still excludes a pod created a full second before createdAfter', async (): Promise<void> => {
    const secondBoundary: number = Math.floor(Date.now() / 1000) * 1000;

    const rawPod: Record<string, unknown> = {
      metadata: {
        name: 'haproxy-node1-old',
        namespace: 'test-namespace',
        // Pod created in the previous second — old pod being terminated
        creationTimestamp: new Date(secondBoundary - 1000),
      },
      spec: {containers: [{name: 'haproxy'}]},
      status: {
        phase: 'Running',
        containerStatuses: [],
      },
    };

    const listStub: SinonStub = sinon.stub().resolves({items: [rawPod]});
    const pods: K8ClientPods = new K8ClientPods({listNamespacedPod: listStub} as never, {} as never, '');

    const createdAfter: Date = new Date(secondBoundary);

    try {
      await pods.waitForRunningPhase(
        NamespaceName.of('test-namespace'),
        ['app=haproxy-node1'],
        2,
        0,
        undefined,
        createdAfter,
      );
      expect.fail('Expected KubePodNotFoundError');
    } catch (error: unknown) {
      expect(error).to.be.instanceOf(KubePodNotFoundError);
    }
  });
});
