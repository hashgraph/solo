// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {K8ClientServices} from '../../../../src/integration/kube/k8-client/resources/service/k8-client-services.js';
import {KubeServiceLoadBalancerTimeoutError} from '../../../../src/integration/kube/errors/kube-service-load-balancer-timeout-error.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type Service} from '../../../../src/integration/kube/resources/service/service.js';
import {resetForTest} from '../../../test-container.js';

interface ServiceItemOptions {
  type: string;
  ingress?: Array<{ip?: string; hostname?: string}>;
}

function buildServiceItem({type, ingress}: ServiceItemOptions): object {
  return {
    metadata: {name: 'relay-1'},
    spec: {type},
    status: ingress ? {loadBalancer: {ingress}} : {},
  };
}

function buildServices(listStub: SinonStub): K8ClientServices {
  return new K8ClientServices({
    listNamespacedService: listStub,
  } as never);
}

describe('K8ClientServices waitForLoadBalancerAddress', (): void => {
  const namespace: NamespaceName = NamespaceName.of('solo-e2e');
  const labels: string[] = ['app.kubernetes.io/instance=relay-1'];

  before((): void => {
    resetForTest();
  });

  it('resolves once every LoadBalancer service has an address', async (): Promise<void> => {
    const listStub: SinonStub = sinon.stub();
    listStub.onFirstCall().resolves({items: [buildServiceItem({type: 'LoadBalancer', ingress: [{}]})]});
    listStub.onSecondCall().resolves({items: [buildServiceItem({type: 'LoadBalancer', ingress: [{ip: '10.0.0.1'}]})]});
    const services: K8ClientServices = buildServices(listStub);

    const result: Service[] = await services.waitForLoadBalancerAddress(namespace, labels, 3, 0);

    expect(result).to.have.lengthOf(1);
    expect(listStub).to.have.callCount(2);
  });

  it('ignores non-LoadBalancer services when checking for addresses', async (): Promise<void> => {
    const listStub: SinonStub = sinon.stub().resolves({
      items: [
        buildServiceItem({type: 'ClusterIP'}),
        buildServiceItem({type: 'LoadBalancer', ingress: [{hostname: 'lb.example.test'}]}),
      ],
    });
    const services: K8ClientServices = buildServices(listStub);

    const result: Service[] = await services.waitForLoadBalancerAddress(namespace, labels, 3, 0);

    expect(result).to.have.lengthOf(1);
    expect(result[0].spec.type).to.equal('LoadBalancer');
  });

  it('throws when no address is assigned within the allotted attempts', async (): Promise<void> => {
    const listStub: SinonStub = sinon.stub().resolves({
      items: [buildServiceItem({type: 'LoadBalancer'})],
    });
    const services: K8ClientServices = buildServices(listStub);

    try {
      await services.waitForLoadBalancerAddress(namespace, labels, 2, 0);
      expect.fail('expected waitForLoadBalancerAddress to reject');
    } catch (error: Error | unknown) {
      expect(error).to.be.instanceOf(KubeServiceLoadBalancerTimeoutError);
      expect(listStub).to.have.callCount(2);
    }
  });
});
