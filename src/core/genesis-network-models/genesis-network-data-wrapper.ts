// SPDX-License-Identifier: Apache-2.0

import {type NodeId} from '../../types/aliases.js';
import {type ServiceEndpoint} from '../../types/index.js';

export abstract class GenesisNetworkDataWrapper {
  public gossipEndpoint: ServiceEndpoint[] = [];
  public weight: number;
  public gossipCaCertificate: string;

  protected constructor(public readonly nodeId: NodeId) {}

  /**
   * @param domainName - a fully qualified domain name
   * @param port
   */
  public addGossipEndpoint(domainName: string, port: number): void {
    this.gossipEndpoint.push({domainName, port, ipAddressV4: ''});
  }
}
