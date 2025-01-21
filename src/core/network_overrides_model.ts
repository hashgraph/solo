/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import * as yaml from 'yaml';
import * as constants from './constants.js';
import {Templates} from './templates.js';
import type {NodeAliases} from '../types/aliases.js';
import type {NetworkNodeServices} from './network_node_services.js';
import type {GossipEndpoint} from '../types/index.js';

export class NetworkOverridesModel {
  private readonly interfaceBindings: GossipEndpoint[] = [];
  private readonly endpointOverrides: GossipEndpoint[] = [];

  public constructor(nodeAliases: NodeAliases, networkNodeServiceMap: Map<string, NetworkNodeServices>) {
    nodeAliases.forEach(nodeAlias => {
      const namespace = networkNodeServiceMap.get(nodeAlias).namespace;
      const nodeId = +networkNodeServiceMap.get(nodeAlias).nodeId;

      const localClusterPort = +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT;
      const localClusterHostName = Templates.renderFullyQualifiedNetworkSvcName(namespace, nodeAlias);

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
    return yaml.stringify({
      gossip: {
        interfaceBindings: this.interfaceBindings,
        endpointOverrides: this.endpointOverrides,
      },
    });
  }
}
