// SPDX-License-Identifier: Apache-2.0

import {it} from 'mocha';
import {expect} from 'chai';
import {Cluster} from '../../../../../src/core/config/remote/cluster.js';
import {type ClusterReference} from '../../../../../src/core/config/remote/types.js';
import {type ClusterStruct} from '../../../../../src/core/config/remote/interfaces/cluster-struct.js';

describe('Cluster', () => {
  it('should convert to an object', () => {
    const clusterData: ClusterStruct = {
      name: 'name',
      namespace: 'namespace',
      deployment: 'deployment',
      dnsBaseDomain: 'cluster.world',
      dnsConsensusNodePattern: 'network.svc',
    };

    const cluster: Cluster = new Cluster(
      clusterData.name,
      clusterData.namespace,
      clusterData.deployment,
      clusterData.dnsBaseDomain,
      clusterData.dnsConsensusNodePattern,
    );

    const clusterObject: ClusterStruct = cluster.toObject();
    expect(clusterObject.name).to.equal(clusterData.name);
    expect(clusterObject.namespace).to.equal(clusterData.namespace);
    expect(clusterObject.deployment).to.equal(clusterData.deployment);
    expect(clusterObject.dnsBaseDomain).to.equal(clusterData.dnsBaseDomain);
    expect(clusterObject.dnsConsensusNodePattern).to.equal(clusterData.dnsConsensusNodePattern);
  });

  it('should convert clusters map to an object', () => {
    const clusterData1: ClusterStruct = {
      name: 'name1',
      namespace: 'namespace1',
      deployment: 'deployment1',
      dnsBaseDomain: 'cluster1.world',
      dnsConsensusNodePattern: 'network1.svc',
    };

    const clusterData2: ClusterStruct = {
      name: 'name2',
      namespace: 'namespace2',
      deployment: 'deployment2',
      dnsBaseDomain: 'cluster2.world',
      dnsConsensusNodePattern: 'network2.svc',
    };

    const clusterMap1: Record<ClusterReference, Cluster> = {
      cluster1: new Cluster(
        clusterData1.name,
        clusterData1.namespace,
        clusterData1.deployment,
        clusterData1.dnsBaseDomain,
        clusterData1.dnsConsensusNodePattern,
      ),
      cluster2: new Cluster(
        clusterData2.name,
        clusterData2.namespace,
        clusterData2.deployment,
        clusterData2.dnsBaseDomain,
        clusterData2.dnsConsensusNodePattern,
      ),
    };

    const clustersMapObject: any = Cluster.toClustersMapObject(clusterMap1);
    expect(clustersMapObject.cluster1.name).to.equal(clusterData1.name);
    expect(clustersMapObject.cluster1.namespace).to.equal(clusterData1.namespace);
    expect(clustersMapObject.cluster1.deployment).to.equal(clusterData1.deployment);
    expect(clustersMapObject.cluster1.dnsBaseDomain).to.equal(clusterData1.dnsBaseDomain);
    expect(clustersMapObject.cluster1.dnsConsensusNodePattern).to.equal(clusterData1.dnsConsensusNodePattern);

    expect(clustersMapObject.cluster2.name).to.equal(clusterData2.name);
    expect(clustersMapObject.cluster2.namespace).to.equal(clusterData2.namespace);
    expect(clustersMapObject.cluster2.deployment).to.equal(clusterData2.deployment);
    expect(clustersMapObject.cluster2.dnsBaseDomain).to.equal(clusterData2.dnsBaseDomain);
    expect(clustersMapObject.cluster2.dnsConsensusNodePattern).to.equal(clusterData2.dnsConsensusNodePattern);

    const clustersMap2: Record<ClusterReference, Cluster> = Cluster.fromClustersMapObject(clustersMapObject);
    expect(clustersMap2.cluster1.name).to.equal(clusterMap1.cluster1.name);
    expect(clustersMap2.cluster1.namespace).to.equal(clusterMap1.cluster1.namespace);
    expect(clustersMap2.cluster1.deployment).to.equal(clusterMap1.cluster1.deployment);
    expect(clustersMap2.cluster1.dnsBaseDomain).to.equal(clusterMap1.cluster1.dnsBaseDomain);
    expect(clustersMap2.cluster1.dnsConsensusNodePattern).to.equal(clusterMap1.cluster1.dnsConsensusNodePattern);

    expect(clustersMap2.cluster2.name).to.equal(clusterMap1.cluster2.name);
    expect(clustersMap2.cluster2.namespace).to.equal(clusterMap1.cluster2.namespace);
    expect(clustersMap2.cluster2.deployment).to.equal(clusterMap1.cluster2.deployment);
    expect(clustersMap2.cluster2.dnsBaseDomain).to.equal(clusterMap1.cluster2.dnsBaseDomain);
    expect(clustersMap2.cluster2.dnsConsensusNodePattern).to.equal(clusterMap1.cluster2.dnsConsensusNodePattern);
  });
});
