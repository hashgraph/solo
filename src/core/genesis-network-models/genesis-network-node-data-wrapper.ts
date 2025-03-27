// SPDX-License-Identifier: Apache-2.0

import {type AccountId, type PublicKey} from '@hashgraph/sdk';
import {
  type GenesisNetworkNodeStructure,
  type NodeAccountId,
  type ServiceEndpoint,
  type ToObject,
} from '../../types/index.js';
import {GenesisNetworkDataWrapper} from './genesis-network-data-wrapper.js';
import {isIPv4Address} from '../helpers.js';

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
   * @param address - a fully qualified domain name
   * @param port
   */
  public addServiceEndpoint(address: string, port: number): void {
    const isIpV4Address: boolean = isIPv4Address(address);
    this.serviceEndpoint.push({
      domainName: isIpV4Address ? '' : address,
      port,
      ipAddressV4: isIpV4Address ? address : '',
    });
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
