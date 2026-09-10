// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {K8ClientConfigMaps} from '../../../../src/integration/kube/k8-client/resources/config-map/k8-client-config-maps.js';
import {KubeApiResponse} from '../../../../src/integration/kube/kube-api-response.js';
import {KubeApiError} from '../../../../src/integration/kube/errors/kube-api-error.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../../test-container.js';

function buildConfigMaps(patchStub: SinonStub, readStub: SinonStub): K8ClientConfigMaps {
  return new K8ClientConfigMaps({
    readNamespacedConfigMap: readStub,
    patchNamespacedConfigMap: patchStub,
  } as never);
}

function buildApiError(code: number): Error {
  const error: Error & {code?: number} = new Error(`HTTP-Code: ${code}`);
  error.code = code;
  return error;
}

function buildReadStub(): SinonStub {
  return sinon.stub().resolves({
    metadata: {name: 'solo-remote-config', namespace: 'one-shot'},
    data: {},
  });
}

describe('K8ClientConfigMaps update retry', (): void => {
  const namespace: NamespaceName = NamespaceName.of('one-shot');
  const name: string = 'solo-remote-config';
  const data: Record<string, string> = {key: 'value'};

  before((): void => {
    resetForTest();
  });

  it('retries on transient 500 and succeeds', async (): Promise<void> => {
    const patchStub: SinonStub = sinon.stub();
    patchStub.onFirstCall().rejects(buildApiError(500));
    patchStub.onSecondCall().resolves({metadata: {name: 'solo-remote-config'}});
    const configMaps: K8ClientConfigMaps = buildConfigMaps(patchStub, buildReadStub());

    await configMaps.update(namespace, name, data, 3, 0);

    expect(patchStub).to.have.callCount(2);
  });

  it('does not retry a non-transient error', async (): Promise<void> => {
    const patchStub: SinonStub = sinon.stub().rejects(buildApiError(422));
    const configMaps: K8ClientConfigMaps = buildConfigMaps(patchStub, buildReadStub());

    try {
      await configMaps.update(namespace, name, data, 3, 0);
      expect.fail('expected update to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubeApiError);
    }
    expect(patchStub).to.have.callCount(1);
  });

  it('gives up after maxAttempts transient errors', async (): Promise<void> => {
    const patchStub: SinonStub = sinon.stub().rejects(buildApiError(500));
    const configMaps: K8ClientConfigMaps = buildConfigMaps(patchStub, buildReadStub());

    try {
      await configMaps.update(namespace, name, data, 3, 0);
      expect.fail('expected update to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubeApiError);
    }
    expect(patchStub).to.have.callCount(3);
  });
});

describe('KubeApiResponse.isTransientServerError', (): void => {
  for (const code of [429, 500, 502, 503, 504]) {
    it(`returns true for transient code ${code}`, (): void => {
      expect(KubeApiResponse.isTransientServerError(buildApiError(code))).to.be.true;
    });
  }

  for (const code of [404, 422]) {
    it(`returns false for non-transient code ${code}`, (): void => {
      expect(KubeApiResponse.isTransientServerError(buildApiError(code))).to.be.false;
    });
  }

  it('returns false for an error with undefined statusCode', (): void => {
    expect(KubeApiResponse.isTransientServerError({statusCode: undefined} as never)).to.be.false;
  });

  it('returns false for undefined input', (): void => {
    expect(KubeApiResponse.isTransientServerError(undefined as never)).to.be.false;
  });
});
