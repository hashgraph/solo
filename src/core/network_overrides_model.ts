/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as yaml from 'yaml';
import * as constants from './constants.js';
import {Templates} from './templates.js';
import {type NodeAliases} from '../types/aliases.js';
import {type NetworkNodeServices} from './network_node_services.js';
import {type GossipEndpoint} from '../types/index.js';

export class NodeOverridesModel {
  private readonly interfaceBindings: GossipEndpoint[] = [];
  private readonly endpointOverrides: GossipEndpoint[] = [];

  public constructor(nodeAliases: NodeAliases, networkNodeServiceMap: Map<string, NetworkNodeServices>) {
    nodeAliases.forEach(nodeAlias => {
      const nodeId = +networkNodeServiceMap.get(nodeAlias).nodeId;

      const localClusterPort = +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT;
      const localClusterHostName = Templates.renderNetworkHeadlessSvcName(nodeAlias);

      this.interfaceBindings.push({nodeId, hostname: localClusterHostName, port: localClusterPort});
      // TODO future, add endpointOverrides for addresses external to cluster in multi-cluster support situation
      //  this.endpointOverrides.push({nodeId, hostname: externalHostname, port: externalPort});
    });
  }

  /**
   * Converts the model to YAML as expected to be consumed inside node
   * @returns the raw YAML as string
   *
   * @example
   * gossip:
   *   interfaceBindings:
   *     - { "nodeId": 0, "hostname": "10.10.10.1", "port": 1234 }
   *     - { "nodeId": 3, "hostname": "2001:db8:3333:4444:5555:6666:7777:8888", "port": 1237 }
   *   endpointOverrides:
   *     - { "nodeId": 5, "hostname": "10.10.10.11", "port": 1238 }
   */
  public toYAML(): string {
    const gossipData: {interfaceBindings?: string[]; endpointOverrides?: string[]} = {};

    if (this.interfaceBindings.length) {
      gossipData.interfaceBindings = this.interfaceBindings.map(d => JSON.stringify(d));
    }

    if (this.endpointOverrides.length) {
      gossipData.endpointOverrides = this.endpointOverrides.map(d => JSON.stringify(d));
    }

    return yaml.stringify({gossip: gossipData}).replaceAll(/'/g, '');
  }
}
