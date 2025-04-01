// SPDX-License-Identifier: Apache-2.0

import {it} from 'mocha';
import {expect} from 'chai';
import {SoloError} from '../../../../../src/core/errors/solo-error.js';
import {Cluster} from '../../../../../src/core/config/remote/cluster.js';
import {type ClusterReference} from '../../../../../src/core/config/remote/types.js';

describe('Cluster', () => {
  it('should fail if name is not provided', () => {
    expect(() => new Cluster(null, 'valid', 'valid')).to.throw(SoloError, 'name is required');
    expect(() => new Cluster('', 'valid', 'valid')).to.throw(SoloError, 'name is required');
  });

  it('should fail if name is not a string', () => {
    const name = 1; // @ts-ignore
    expect(() => new Cluster(name, 'valid', 'valid')).to.throw(SoloError, 'Invalid type for name: number');
  });

  it('should fail if namespace is not provided', () => {
    expect(() => new Cluster('valid', null, 'valid')).to.throw(SoloError, 'namespace is required');
    expect(() => new Cluster('valid', '', 'valid')).to.throw(SoloError, 'namespace is required');
  });

  it('should fail if namespace is not a string', () => {
    const namespace = 1; // @ts-ignore
    expect(() => new Cluster('valid', namespace, 'valid')).to.throw(SoloError, 'Invalid type for namespace: number');
  });

  it('should convert to an object', () => {
    const c = new Cluster('name', 'namespace', 'deployment', 'cluster.world', 'network.svc');
    const o = c.toObject();
    expect(o.name).to.equal('name');
    expect(o.namespace).to.equal('namespace');
    expect(o.deployment).to.equal('deployment');
    expect(o.dnsBaseDomain).to.equal('cluster.world');
    expect(o.dnsConsensusNodePattern).to.equal('network.svc');
  });

  it('should convert clusters map to an object', () => {
    const map1: Record<ClusterReference, Cluster> = {
      cluster1: new Cluster('name1', 'namespace1', 'deployment1', 'cluster1.world', 'network1.svc'),
      cluster2: new Cluster('name2', 'namespace2', 'deployment2', 'cluster2.world', 'network2.svc'),
    };

    const o = Cluster.toClustersMapObject(map1);
    expect(o.cluster1.name).to.equal('name1');
    expect(o.cluster1.namespace).to.equal('namespace1');
    expect(o.cluster1.deployment).to.equal('deployment1');
    expect(o.cluster1.dnsBaseDomain).to.equal('cluster1.world');
    expect(o.cluster1.dnsConsensusNodePattern).to.equal('network1.svc');
    expect(o.cluster2.name).to.equal('name2');
    expect(o.cluster2.namespace).to.equal('namespace2');
    expect(o.cluster2.deployment).to.equal('deployment2');
    expect(o.cluster2.dnsBaseDomain).to.equal('cluster2.world');
    expect(o.cluster2.dnsConsensusNodePattern).to.equal('network2.svc');

    const map2 = Cluster.fromClustersMapObject(o);
    expect(map2.cluster1.name).to.equal(map1.cluster1.name);
    expect(map2.cluster1.namespace).to.equal(map1.cluster1.namespace);
    expect(map2.cluster1.deployment).to.equal(map1.cluster1.deployment);
    expect(map2.cluster1.dnsBaseDomain).to.equal(map1.cluster1.dnsBaseDomain);
    expect(map2.cluster1.dnsConsensusNodePattern).to.equal(map1.cluster1.dnsConsensusNodePattern);
    expect(map2.cluster2.name).to.equal(map1.cluster2.name);
    expect(map2.cluster2.namespace).to.equal(map1.cluster2.namespace);
    expect(map2.cluster2.deployment).to.equal(map1.cluster2.deployment);
    expect(map2.cluster2.dnsBaseDomain).to.equal(map1.cluster2.dnsBaseDomain);
    expect(map2.cluster2.dnsConsensusNodePattern).to.equal(map1.cluster2.dnsConsensusNodePattern);
  });
});
