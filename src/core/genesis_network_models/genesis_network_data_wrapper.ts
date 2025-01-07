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
import type {NodeId} from '../../types/aliases.js';
import type {ServiceEndpoint} from '../../types/index.js';

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
