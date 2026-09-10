// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, describe, it} from 'mocha';
import sinon from 'sinon';

import {Address} from '../../../../src/business/address/address.js';
import {type ConsensusNode} from '../../../../src/core/model/consensus-node.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Service} from '../../../../src/integration/kube/resources/service/service.js';
import {type Services} from '../../../../src/integration/kube/resources/service/services.js';

function buildK8StubWithService(service: Partial<Service>): K8 {
  const servicesStub: Services = {
    list: sinon.stub().resolves([service]),
  } as unknown as Services;
  return {services: (): Services => servicesStub} as unknown as K8;
}

describe('Address', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  describe('getExternalAddress', (): void => {
    const mockConsensusNode: ConsensusNode = {
      name: 'node1',
      nodeId: 0,
      namespace: 'solo',
      cluster: 'cluster1',
      context: 'context1',
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-node{nodeId}-svc',
      fullyQualifiedDomainName: 'network-node0-svc.solo.svc.cluster.local',
      blockNodeMap: [],
      externalBlockNodeMap: [],
    } as ConsensusNode;

    it('should return LoadBalancer IP when available', async (): Promise<void> => {
      const k8Stub: K8 = buildK8StubWithService({
        metadata: {name: 'network-node0-svc'},
        spec: {type: 'LoadBalancer', clusterIP: '10.0.0.1'},
        status: {loadBalancer: {ingress: [{ip: '1.2.3.4'}]}},
      } as Service);

      const address: Address = await Address.getExternalAddress(mockConsensusNode, k8Stub, 50_111);

      expect(address.ipAddressV4).to.equal('1.2.3.4');
      expect(address.domainName).to.be.undefined;
    });

    it('should return LoadBalancer hostname when available', async (): Promise<void> => {
      const k8Stub: K8 = buildK8StubWithService({
        metadata: {name: 'network-node0-svc'},
        spec: {type: 'LoadBalancer', clusterIP: '10.0.0.1'},
        status: {loadBalancer: {ingress: [{hostname: 'my.lb.example.com'}]}},
      } as Service);

      const address: Address = await Address.getExternalAddress(mockConsensusNode, k8Stub, 50_111);

      expect(address.domainName).to.equal('my.lb.example.com');
      expect(address.ipAddressV4).to.be.undefined;
    });

    it('should return cluster IP for NodePort service (no LoadBalancer IP)', async (): Promise<void> => {
      const k8Stub: K8 = buildK8StubWithService({
        metadata: {name: 'network-node0-svc'},
        spec: {type: 'NodePort', clusterIP: '10.96.0.5'},
        status: {loadBalancer: {}},
      } as Service);

      const address: Address = await Address.getExternalAddress(mockConsensusNode, k8Stub, 50_111);

      expect(address.ipAddressV4).to.equal('10.96.0.5');
      expect(address.domainName).to.be.undefined;
    });

    it('should return FQDN for NodePort when gossipFqdnRestricted is false', async (): Promise<void> => {
      const k8Stub: K8 = buildK8StubWithService({
        metadata: {name: 'network-node0-svc'},
        spec: {type: 'NodePort', clusterIP: '10.96.0.5'},
        status: {loadBalancer: {}},
      } as Service);

      const address: Address = await Address.getExternalAddress(mockConsensusNode, k8Stub, 50_111, false);

      expect(address.domainName).to.equal('network-node0-svc.solo.svc.cluster.local');
      expect(address.ipAddressV4).to.be.undefined;
    });

    it('should return cluster IP when LoadBalancer has no ingress', async (): Promise<void> => {
      const k8Stub: K8 = buildK8StubWithService({
        metadata: {name: 'network-node0-svc'},
        spec: {type: 'LoadBalancer', clusterIP: '10.96.0.6'},
        status: {loadBalancer: {ingress: []}},
      } as Service);

      const address: Address = await Address.getExternalAddress(mockConsensusNode, k8Stub, 50_111);

      expect(address.ipAddressV4).to.equal('10.96.0.6');
      expect(address.domainName).to.be.undefined;
    });

    it('should fall back to FQDN when service list is empty', async (): Promise<void> => {
      const servicesStub: Services = {
        list: sinon.stub().resolves([]),
      } as unknown as Services;
      const k8Stub: K8 = {services: (): Services => servicesStub} as unknown as K8;

      const address: Address = await Address.getExternalAddress(mockConsensusNode, k8Stub, 50_111);

      expect(address.domainName).to.equal('network-node0-svc.solo.svc.cluster.local');
      expect(address.ipAddressV4).to.be.undefined;
    });

    it('should find service by node name when node id lookup misses', async (): Promise<void> => {
      const listStub: sinon.SinonStub = sinon.stub();
      listStub.onFirstCall().resolves([]);
      listStub.onSecondCall().resolves([
        {
          metadata: {name: 'network-node0-svc'},
          spec: {type: 'NodePort', clusterIP: '10.96.0.7'},
          status: {loadBalancer: {}},
        } as Service,
      ]);
      const servicesStub: Services = {
        list: listStub,
      } as unknown as Services;
      const k8Stub: K8 = {services: (): Services => servicesStub} as unknown as K8;

      const address: Address = await Address.getExternalAddress(mockConsensusNode, k8Stub, 50_111);

      expect(address.ipAddressV4).to.equal('10.96.0.7');
      expect(address.domainName).to.be.undefined;
      expect(listStub.secondCall.args[1]).to.deep.equal([
        'solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node-svc',
      ]);
    });

    it('should fall back to FQDN when k8 service lookup throws', async (): Promise<void> => {
      const servicesStub: Services = {
        list: sinon.stub().rejects(new Error('k8s API error')),
      } as unknown as Services;
      const k8Stub: K8 = {services: (): Services => servicesStub} as unknown as K8;

      const address: Address = await Address.getExternalAddress(mockConsensusNode, k8Stub, 50_111);

      expect(address.domainName).to.equal('network-node0-svc.solo.svc.cluster.local');
      expect(address.ipAddressV4).to.be.undefined;
    });
  });
});
