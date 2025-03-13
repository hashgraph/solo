// SPDX-License-Identifier: Apache-2.0

import {type AccountId, type PublicKey} from '@hashgraph/sdk';
import {
  type GenesisNetworkNodeStructure,
  type NodeAccountId,
  type ServiceEndpoint,
  type ToObject,
} from '../../types/index.js';
import {GenesisNetworkDataWrapper} from './genesis_network_data_wrapper.js';

export class GenesisNetworkNodeDataWrapper
  extends GenesisNetworkDataWrapper
  implements ToObject<GenesisNetworkNodeStructure>
{
  public accountId: AccountId;
  public serviceEndpoint: ServiceEndpoint[] = [];
  public grpcCertificateHash: string;
  public readonly deleted = false;

  constructor(
    public readonly nodeId: number,
    public readonly adminKey: PublicKey,
    public readonly description: string,
  ) {
    super(nodeId);
  }

  /**
   * @param domainName - a fully qualified domain name
   * @param port
   */
  public addServiceEndpoint(domainName: string, port: number): void {
    this.serviceEndpoint.push({domainName, port, ipAddressV4: ''});
  }

  public toObject() {
    return {
      nodeId: this.nodeId,
      accountId: {accountNum: `${this.accountId.num}`} as unknown as NodeAccountId,
      description: this.description,
      gossipEndpoint: this.gossipEndpoint,
      serviceEndpoint: this.serviceEndpoint,
      gossipCaCertificate: this.gossipCaCertificate,
      grpcCertificateHash: this.grpcCertificateHash,
      weight: this.weight,
      deleted: this.deleted,
      adminKey: this.adminKey,
    };
  }
}
