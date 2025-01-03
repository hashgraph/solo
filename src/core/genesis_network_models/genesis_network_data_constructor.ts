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
import crypto from 'node:crypto';
import {PrivateKey} from '@hashgraph/sdk';
import {GenesisNetworkNodeDataWrapper} from './genesis_network_node_data_wrapper.js';
import * as constants from '../constants.js';

import type {KeyManager} from '../key_manager.js';
import type {ToJSON} from '../../types/index.js';
import type {JsonString, NodeAlias, NodeAliases} from '../../types/aliases.js';
import {GenesisNetworkRosterEntryDataWrapper} from './genesis_network_roster_entry_data_wrapper.js';
import {Templates} from '../templates.js';
import path from 'path';
import {Base64} from 'js-base64';

/**
 * Used to construct the nodes data and convert them to JSON
 */
export class GenesisNetworkDataConstructor implements ToJSON {
  public readonly nodes: Record<NodeAlias, GenesisNetworkNodeDataWrapper> = {};
  public readonly rosters: Record<NodeAlias, GenesisNetworkRosterEntryDataWrapper> = {};

  private constructor(
    private readonly nodeAliases: NodeAliases,
    private readonly keyManager: KeyManager,
    private readonly keysDir: string,
  ) {
    nodeAliases.forEach((nodeAlias, nodeId) => {
      // TODO: get nodeId from label in pod.
      const adminPrivateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
      const adminPubKey = adminPrivateKey.publicKey;

      this.nodes[nodeAlias] = new GenesisNetworkNodeDataWrapper(nodeId, adminPubKey, nodeAlias);
      this.rosters[nodeAlias] = new GenesisNetworkRosterEntryDataWrapper(nodeId);
    });
  }

  public static async initialize(
    nodeAliases: NodeAliases,
    keyManager: KeyManager,
    keysDir: string,
  ): Promise<GenesisNetworkDataConstructor> {
    const instance = new GenesisNetworkDataConstructor(nodeAliases, keyManager, keysDir);

    await instance.load();

    return instance;
  }

  /**
   * Loads the gossipCaCertificate and grpcCertificateHash
   */
  private async load() {
    await Promise.all(
      this.nodeAliases.map(async nodeAlias => {
        const signingCertFile = Templates.renderGossipPemPublicKeyFile(nodeAlias);
        const signingCertFullPath = path.join(this.keysDir, signingCertFile);
        const derCertificate = this.keyManager.getDerFromPemCertificate(signingCertFullPath);

        //* Assign the DER formatted certificate
        this.rosters[nodeAlias].gossipCaCertificate = this.nodes[nodeAlias].gossipCaCertificate =
          Buffer.from(derCertificate).toString('base64');

        //* Generate the SHA-384 hash
        this.nodes[nodeAlias].grpcCertificateHash = '';
      }),
    );
  }

  public toJSON(): JsonString {
    const nodeMetadata = [];
    Object.keys(this.nodes).forEach(nodeAlias => {
      nodeMetadata.push({
        node: this.nodes[nodeAlias].toObject(),
        rosterEntry: this.rosters[nodeAlias].toObject(),
      });
    });

    return JSON.stringify({nodeMetadata: nodeMetadata});
  }
}
