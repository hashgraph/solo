// SPDX-License-Identifier: Apache-2.0

import {Templates} from '../../../src/core/templates.js';
import {expect} from 'chai';
import {type ConsensusNode} from '../../../src/core/model/consensus-node.js';

describe('core/templates', () => {
  const consensusNodes: ConsensusNode[] = [
    {
      name: 'node1',
      nodeId: 1,
      namespace: 'solo',
      cluster: 'solo-cluster',
      context: 'solo-cluster',
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node1-svc.solo.svc.cluster.local',
    },
    {
      name: 'node2',
      nodeId: 2,
      namespace: 'solo',
      cluster: 'solo-cluster',
      context: 'solo-cluster',
      dnsBaseDomain: 'us-west-2.gcp.charlie.sphere',
      dnsConsensusNodePattern: '{nodeId}.consensus.prod',
      fullyQualifiedDomainName: '2.consensus.prod.us-west-2.gcp.charlie.sphere',
    },
  ];
  it('should render FQDN for a consensus node', () => {
    for (const node of consensusNodes) {
      const fqdn = Templates.renderConsensusNodeFullyQualifiedDomainName(
        node.name,
        node.nodeId,
        node.namespace,
        node.cluster,
        node.dnsBaseDomain,
        node.dnsConsensusNodePattern,
      );
      expect(fqdn).to.equal(node.fullyQualifiedDomainName);
    }
  });
});
