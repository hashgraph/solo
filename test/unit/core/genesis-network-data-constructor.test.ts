// SPDX-License-Identifier: Apache-2.0

import {type AccountId, PrivateKey} from '@hiero-ledger/sdk';
import {expect} from 'chai';
import {describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {GenesisNetworkDataConstructor} from '../../../src/core/genesis-network-models/genesis-network-data-constructor.js';
import {type AccountManager} from '../../../src/core/account-manager.js';
import {type KeyManager} from '../../../src/core/key-manager.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {NetworkNodeServices} from '../../../src/core/network-node-services.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {type EndpointPortMapping, type ServiceEndpoint} from '../../../src/types/index.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import * as constants from '../../../src/core/constants.js';

function secureGrpcPorts(basePort: number): number[] {
  return [basePort, basePort + 1];
}

describe('core/genesis-network-data-constructor', (): void => {
  const nodeAliases: NodeAlias[] = ['node1', 'node2'];

  const consensusNodes: ConsensusNode[] = nodeAliases.map(
    (nodeAlias: NodeAlias, index: number): ConsensusNode =>
      new ConsensusNode(nodeAlias, index, 'solo', 'solo-cluster', 'solo-cluster', 'cluster.local', '', '', [], []),
  );

  function networkNodeServiceMap(): NodeServiceMapping {
    const serviceMap: NodeServiceMapping = new Map();

    for (const [index, nodeAlias] of nodeAliases.entries()) {
      serviceMap.set(nodeAlias, {
        nodeId: index,
        accountId: `0.0.${index + 3}`,
        namespace: NamespaceName.of('solo'),
        externalAddress: `network-${nodeAlias}-svc.solo.svc.cluster.local`,
      } as unknown as NetworkNodeServices);
    }

    return serviceMap;
  }

  const keyManager: KeyManager = {
    getDerFromPem: (): Uint8Array => new Uint8Array([1, 2, 3]),
  } as unknown as KeyManager;

  const accountManager: AccountManager = {
    getGossipPublicKeyPem: async (): Promise<string> => 'gossip-public-key-pem',
    createOrReplaceAccountKeySecret: async (): Promise<void> => {},
  } as unknown as AccountManager;

  async function buildGenesisNetworkData(
    gossipEndpointPortMapping?: EndpointPortMapping,
    serviceEndpointPortMapping?: EndpointPortMapping,
  ): Promise<GenesisNetworkDataConstructor> {
    return await GenesisNetworkDataConstructor.initialize(
      consensusNodes,
      keyManager,
      accountManager,
      networkNodeServiceMap(),
      [],
      undefined,
      gossipEndpointPortMapping,
      serviceEndpointPortMapping,
    );
  }

  function gossipPorts(genesisNetworkData: GenesisNetworkDataConstructor): number[] {
    return nodeAliases.flatMap((nodeAlias: NodeAlias): number[] => [
      ...genesisNetworkData.nodes[nodeAlias].gossipEndpoint.map((endpoint: ServiceEndpoint): number => endpoint.port),
      ...genesisNetworkData.rosters[nodeAlias].gossipEndpoint.map((endpoint: ServiceEndpoint): number => endpoint.port),
    ]);
  }

  function servicePorts(genesisNetworkData: GenesisNetworkDataConstructor): number[] {
    return nodeAliases.flatMap((nodeAlias: NodeAlias): number[] =>
      genesisNetworkData.nodes[nodeAlias].serviceEndpoint.map((endpoint: ServiceEndpoint): number => endpoint.port),
    );
  }

  it('should use the default ports when no port override was supplied', async (): Promise<void> => {
    const genesisNetworkData: GenesisNetworkDataConstructor = await buildGenesisNetworkData();

    expect(gossipPorts(genesisNetworkData)).to.deep.equal(
      Array.from({length: 4}, (): number => +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT),
    );
    expect(servicePorts(genesisNetworkData)).to.deep.equal([
      ...secureGrpcPorts(constants.GRPC_PORT),
      ...secureGrpcPorts(constants.GRPC_PORT),
    ]);
  });

  it('should apply the default port of the override to every consensus node', async (): Promise<void> => {
    const genesisNetworkData: GenesisNetworkDataConstructor = await buildGenesisNetworkData(
      {defaultPort: 40_111, nodeAliasToPort: {}},
      {defaultPort: 40_211, nodeAliasToPort: {}},
    );

    expect(gossipPorts(genesisNetworkData)).to.deep.equal([40_111, 40_111, 40_111, 40_111]);
    expect(servicePorts(genesisNetworkData)).to.deep.equal([...secureGrpcPorts(40_211), ...secureGrpcPorts(40_211)]);
  });

  it('should prefer the per node alias port over the default port', async (): Promise<void> => {
    const genesisNetworkData: GenesisNetworkDataConstructor = await buildGenesisNetworkData(
      {defaultPort: 40_111, nodeAliasToPort: {node2: 40_112}},
      {nodeAliasToPort: {node2: 40_212}},
    );

    expect(gossipPorts(genesisNetworkData)).to.deep.equal([40_111, 40_111, 40_112, 40_112]);
    expect(servicePorts(genesisNetworkData)).to.deep.equal([
      ...secureGrpcPorts(constants.GRPC_PORT),
      ...secureGrpcPorts(40_212),
    ]);
  });

  it('should register both grpc and grpcs service endpoints in node metadata', async (): Promise<void> => {
    const generatedAdminKey: PrivateKey = PrivateKey.generateED25519();
    const generateEd25519Stub: SinonStub = sinon.stub(PrivateKey, 'generateED25519').returns(generatedAdminKey);
    const consensusNode: ConsensusNode = new ConsensusNode(
      'node1' as NodeAlias,
      0,
      'solo-e2e',
      'solo-e2e',
      'context1',
      'cluster.local',
      'network-{nodeAlias}-svc.{namespace}.svc',
      'network-node1-svc.solo-e2e.svc.cluster.local',
      [],
      [],
    );
    const networkNodeServices: NetworkNodeServices = new NetworkNodeServices(
      'solo-e2e',
      'context1',
      'deployment',
      consensusNode.name,
      NamespaceName.of('solo-e2e'),
      0,
      PodName.of('network-node1-0'),
      'haproxy-node1-svc',
      '',
      '',
      constants.GRPC_PORT,
      constants.GRPCS_PORT,
      '0.0.3',
      'app=haproxy-node1',
      PodName.of('haproxy-node1-0'),
      'network-node1-svc',
      '',
      '',
      50_210,
      constants.GRPC_PORT,
      constants.GRPCS_PORT,
      'envoy-proxy-node1-svc',
      '',
      '',
      constants.GRPC_WEB_PORT,
      'node1.example.com',
    );
    const accountManagerStub: AccountManager = {
      createOrReplaceAccountKeySecret: sinon.stub().resolves(),
      getGossipPublicKeyPem: sinon.stub().resolves('test-pem'),
    } as unknown as AccountManager;
    const keyManagerStub: KeyManager = {
      getDerFromPem: sinon.stub().returns(Uint8Array.from([1, 2, 3])),
    } as unknown as KeyManager;

    try {
      const constructor: GenesisNetworkDataConstructor = await GenesisNetworkDataConstructor.initialize(
        [consensusNode],
        keyManagerStub,
        accountManagerStub,
        new Map([[consensusNode.name, networkNodeServices]]),
        [],
        {node1: 'grpc.node1.example.com'},
      );

      const serviceEndpoints: ServiceEndpoint[] = constructor.nodes[consensusNode.name].serviceEndpoint;
      const accountId: AccountId = constructor.nodes[consensusNode.name].accountId;

      expect(accountId.toString()).to.equal('0.0.3');
      expect(serviceEndpoints).to.deep.equal([
        {
          domainName: 'grpc.node1.example.com',
          port: constants.GRPC_PORT,
          ipAddressV4: undefined,
        },
        {
          domainName: 'grpc.node1.example.com',
          port: constants.GRPCS_PORT,
          ipAddressV4: undefined,
        },
      ]);
      expect(constructor.nodes[consensusNode.name].adminKey.toString()).to.equal(
        generatedAdminKey.publicKey.toString(),
      );
    } finally {
      generateEd25519Stub.restore();
    }
  });
});
