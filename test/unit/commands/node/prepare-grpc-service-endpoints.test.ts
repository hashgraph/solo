// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {type ServiceEndpoint} from '@hiero-ledger/sdk';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {type NodeAddContext} from '../../../../src/commands/node/config-interfaces/node-add-context.js';
import {type NodeAddConfigClass} from '../../../../src/commands/node/config-interfaces/node-add-config-class.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';
import * as constants from '../../../../src/core/constants.js';

type PrepareGrpcServiceEndpointsTask = (context_: NodeAddContext) => void;

function prepareGrpcServiceEndpoints(config: Partial<NodeAddConfigClass>): ServiceEndpoint[] {
  const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
  const context_: NodeAddContext = {
    config: {
      namespace: NamespaceName.of('solo'),
      nodeAlias: 'node4' as NodeAlias,
      endpointType: constants.ENDPOINT_TYPE_FQDN,
      ...config,
    },
  } as unknown as NodeAddContext;

  (nodeCommandTasks.prepareGrpcServiceEndpoints().task as PrepareGrpcServiceEndpointsTask)(context_);

  return context_.grpcServiceEndpoints;
}

function endpointAddresses(endpoints: ServiceEndpoint[]): string[] {
  return endpoints.map((endpoint: ServiceEndpoint): string => `${endpoint._domainName}:${endpoint._port}`);
}

describe('NodeCommandTasks.prepareGrpcServiceEndpoints', (): void => {
  it('uses the cluster service FQDN when no domain name was supplied for the node', (): void => {
    expect(endpointAddresses(prepareGrpcServiceEndpoints({}))).to.deep.equal([
      `network-node4-svc.solo.svc.cluster.local:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`,
    ]);
  });

  it('uses the domain name supplied for the node', (): void => {
    const endpoints: ServiceEndpoint[] = prepareGrpcServiceEndpoints({
      domainNamesMapping: {node1: 'node1.example.com', node4: 'node4.example.com'},
    });

    expect(endpointAddresses(endpoints)).to.deep.equal([
      `node4.example.com:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`,
    ]);
  });

  it('falls back to the cluster service FQDN when the domain names do not cover the node', (): void => {
    const endpoints: ServiceEndpoint[] = prepareGrpcServiceEndpoints({
      domainNamesMapping: {node1: 'node1.example.com'},
    });

    expect(endpointAddresses(endpoints)).to.deep.equal([
      `network-node4-svc.solo.svc.cluster.local:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`,
    ]);
  });

  it('prefers explicit grpc endpoints over the domain name', (): void => {
    const endpoints: ServiceEndpoint[] = prepareGrpcServiceEndpoints({
      grpcEndpoints: 'grpc.example.com:50211',
      domainNamesMapping: {node4: 'node4.example.com'},
    });

    expect(endpointAddresses(endpoints)).to.deep.equal(['grpc.example.com:50211']);
  });
});
