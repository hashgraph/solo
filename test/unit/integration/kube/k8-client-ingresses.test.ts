// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {K8ClientIngresses} from '../../../../src/integration/kube/k8-client/resources/ingress/k8-client-ingresses.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {resetForTest} from '../../../test-container.js';

function buildIngresses(names: string[]): {ingresses: K8ClientIngresses; patchStub: SinonStub; listStub: SinonStub} {
  const listStub: SinonStub = sinon.stub().resolves({items: names.map((name: string): object => ({metadata: {name}}))});
  const patchStub: SinonStub = sinon.stub().resolves({metadata: {name: 'patched'}});
  const ingresses: K8ClientIngresses = new K8ClientIngresses({
    listNamespacedIngress: listStub,
    patchNamespacedIngress: patchStub,
  } as never);
  return {ingresses, patchStub, listStub};
}

function patchedNames(patchStub: SinonStub): string[] {
  return patchStub.getCalls().map((call: sinon.SinonSpyCall): string => call.args[0].name);
}

describe('K8ClientIngresses update', (): void => {
  const namespace: NamespaceName = NamespaceName.of('solo');
  const patch: object = {spec: {ingressClassName: 'mirror-ingress-class-2'}};

  before((): void => {
    resetForTest();
  });

  it('lists the ingresses of the given namespace only', async (): Promise<void> => {
    const {ingresses, listStub} = buildIngresses([]);

    await ingresses.update(namespace, 'mirror-2', patch);

    expect(listStub).to.have.been.calledOnceWithExactly({namespace: 'solo'});
  });

  it('patches only the ingresses of the release and not those of another mirror node', async (): Promise<void> => {
    const {ingresses, patchStub} = buildIngresses([
      'mirror-1',
      'mirror-1-rest',
      'mirror-2',
      'mirror-2-rest',
      'mirror-2-restjava',
      'mirror-20-rest',
      'explorer',
    ]);

    await ingresses.update(namespace, 'mirror-2', patch);

    expect(patchedNames(patchStub)).to.deep.equal(['mirror-2', 'mirror-2-rest', 'mirror-2-restjava']);
  });

  it('patches the ingresses of one module of a release by its full name prefix', async (): Promise<void> => {
    const {ingresses, patchStub} = buildIngresses(['mirror-1-restjava', 'mirror-2-restjava', 'mirror-2-web3']);

    await ingresses.update(namespace, 'mirror-2-restjava', patch);

    expect(patchedNames(patchStub)).to.deep.equal(['mirror-2-restjava']);
  });
});
