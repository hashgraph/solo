// SPDX-License-Identifier: Apache-2.0

import {Templates} from '../../../src/core/templates.js';
import {expect} from 'chai';
import {type ConsensusNode} from '../../../src/core/model/consensus-node.js';

describe('core/templates', (): void => {
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
      blockNodeMap: [],
      externalBlockNodeMap: [],
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
      blockNodeMap: [],
      externalBlockNodeMap: [],
    },
  ];

  it('should render FQDN for a consensus node', (): void => {
    for (const node of consensusNodes) {
      const fqdn: string = Templates.renderConsensusNodeFullyQualifiedDomainName(
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

  it('should render mirror node service URLs', (): void => {
    expect(Templates.renderMirrorNodeIngressControllerUrl('solo')).to.equal(
      // eslint-disable-next-line unicorn/prefer-https
      'http://mirror-ingress-controller-solo.solo.svc.cluster.local',
    );
    expect(Templates.renderMirrorNodeRestServiceUrl('mirror-1', 'solo')).to.equal(
      // eslint-disable-next-line unicorn/prefer-https
      'http://mirror-1-rest.solo.svc.cluster.local',
    );
    expect(Templates.renderMirrorNodeWeb3ServiceUrl('mirror-1', 'solo')).to.equal(
      // eslint-disable-next-line unicorn/prefer-https
      'http://mirror-1-web3.solo.svc.cluster.local',
    );
  });

  describe('parseNodeAliasToPortMapping', (): void => {
    it('should return an empty mapping when no port was supplied', (): void => {
      expect(Templates.parseNodeAliasToPortMapping()).to.deep.equal({nodeAliasToPort: {}});
      expect(Templates.parseNodeAliasToPortMapping('')).to.deep.equal({nodeAliasToPort: {}});
    });

    it('should apply a single port to every consensus node', (): void => {
      expect(Templates.parseNodeAliasToPortMapping('50211')).to.deep.equal({
        defaultPort: 50_211,
        nodeAliasToPort: {},
      });
    });

    it('should parse per node alias ports', (): void => {
      expect(Templates.parseNodeAliasToPortMapping('node1=50211,node2=50212')).to.deep.equal({
        nodeAliasToPort: {node1: 50_211, node2: 50_212},
      });
    });

    it('should combine a default port with per node alias ports', (): void => {
      expect(Templates.parseNodeAliasToPortMapping('50211,node2=50212')).to.deep.equal({
        defaultPort: 50_211,
        nodeAliasToPort: {node2: 50_212},
      });
    });

    it('should throw when a port is not a valid port number', (): void => {
      const invalidPorts: string[] = ['abc', '0', '65536', '50211.5', '-1', 'node1=abc', 'node1='];

      for (const invalidPort of invalidPorts) {
        expect((): void => {
          Templates.parseNodeAliasToPortMapping(invalidPort);
        }, invalidPort).to.throw(/Invalid port number/);
      }
    });

    it('should throw when the node alias is missing', (): void => {
      expect((): void => {
        Templates.parseNodeAliasToPortMapping('=50211');
      }).to.throw(/Cannot parse node alias/);
    });
  });
});
