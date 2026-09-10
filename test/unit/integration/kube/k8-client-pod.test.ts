// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {K8ClientPod} from '../../../../src/integration/kube/k8-client/resources/pod/k8-client-pod.js';
import {KubeContainerOperationFailedError} from '../../../../src/integration/kube/errors/kube-container-operation-failed-error.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {type Pods} from '../../../../src/integration/kube/resources/pod/pods.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../../test-container.js';

/**
 * Builds an error with the runtime shape of `@kubernetes/client-node`'s `ApiException` for an
 * undocumented status code: the HTTP status on `error.code` and the response body as an
 * unparsed JSON string on `error.body`.
 */
function apiException(code: number, body: object): Error {
  return Object.assign(
    new Error(`HTTP-Code: ${code}\nMessage: Unknown API Status Code!\nBody: ${JSON.stringify(body)}`),
    {
      code,
      body: JSON.stringify(body),
      headers: {},
    },
  );
}

describe('K8ClientPod killPod', (): void => {
  const podReference: PodReference = PodReference.of(NamespaceName.of('test-namespace'), PodName.of('test-pod'));

  let deleteNamespacedPodStub: SinonStub;
  let podClient: K8ClientPod;

  beforeEach((): void => {
    resetForTest();
    deleteNamespacedPodStub = sinon.stub();
    const pods: Pods = {read: sinon.stub().resolves()} as unknown as Pods;
    podClient = new K8ClientPod(
      podReference,
      pods,
      {deleteNamespacedPod: deleteNamespacedPodStub} as never,
      {} as never,
      '',
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('treats an ApiException 404 (undocumented status code, string body) as pod already deleted', async (): Promise<void> => {
    deleteNamespacedPodStub.rejects(
      apiException(404, {kind: 'Status', status: 'Failure', reason: 'NotFound', code: 404}),
    );

    await expect(podClient.killPod()).to.eventually.be.fulfilled;
  });

  it('treats a parsed-body 404 as pod already deleted', async (): Promise<void> => {
    deleteNamespacedPodStub.rejects(Object.assign(new Error('pod not found'), {body: {code: 404}}));

    await expect(podClient.killPod()).to.eventually.be.fulfilled;
  });

  it('still throws KubeContainerOperationFailedError for non-404 failures', async (): Promise<void> => {
    const cause: Error = apiException(500, {kind: 'Status', status: 'Failure', code: 500});
    deleteNamespacedPodStub.rejects(cause);

    await expect(podClient.killPod())
      .to.eventually.be.rejectedWith(KubeContainerOperationFailedError)
      .and.have.property('cause', cause);
  });
});
