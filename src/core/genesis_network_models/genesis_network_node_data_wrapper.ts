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
import type {AccountId, PublicKey} from '@hashgraph/sdk';
import type {GenesisNetworkNodeStructure, NodeAccountId, ServiceEndpoint, ToObject} from '../../types/index.js';
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
