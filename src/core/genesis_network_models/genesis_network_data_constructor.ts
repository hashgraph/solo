/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {AccountId, PrivateKey, PublicKey} from '@hashgraph/sdk';
import {GenesisNetworkNodeDataWrapper} from './genesis_network_node_data_wrapper.js';
import * as constants from '../constants.js';

import {type KeyManager} from '../key_manager.js';
import {type ToJSON} from '../../types/index.js';
import {type JsonString, type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import {GenesisNetworkRosterEntryDataWrapper} from './genesis_network_roster_entry_data_wrapper.js';
import {Templates} from '../templates.js';
import path from 'path';
import {type NetworkNodeServices} from '../network_node_services.js';
import {SoloError} from '../errors.js';
import {Flags as flags} from '../../commands/flags.js';

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
    private readonly networkNodeServiceMap: Map<string, NetworkNodeServices>,
    adminPublicKeyMap: Map<NodeAlias, string>,
  ) {
    nodeAliases.forEach(nodeAlias => {
      const genesisPrivateKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);

      let adminPubKey: PublicKey;
      try {
        if (PublicKey.fromStringED25519(adminPublicKeyMap[nodeAlias])) {
          adminPubKey = adminPublicKeyMap[nodeAlias];
        }
      } catch {
        // Ignore error
      }

      if (!adminPubKey) adminPubKey = genesisPrivateKey.publicKey;

      const nodeDataWrapper = new GenesisNetworkNodeDataWrapper(
        +networkNodeServiceMap.get(nodeAlias).nodeId,
        adminPubKey,
        nodeAlias,
      );
      this.nodes[nodeAlias] = nodeDataWrapper;
      nodeDataWrapper.accountId = AccountId.fromString(networkNodeServiceMap.get(nodeAlias).accountId);

      const rosterDataWrapper = new GenesisNetworkRosterEntryDataWrapper(+networkNodeServiceMap.get(nodeAlias).nodeId);
      this.rosters[nodeAlias] = rosterDataWrapper;
      rosterDataWrapper.weight = this.nodes[nodeAlias].weight = constants.HEDERA_NODE_DEFAULT_STAKE_AMOUNT;

      const externalPort = +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT;
      const namespace = networkNodeServiceMap.get(nodeAlias).namespace;
      const externalIP = Templates.renderFullyQualifiedNetworkSvcName(namespace, nodeAlias);
      // Add gossip endpoints
      nodeDataWrapper.addGossipEndpoint(externalIP, externalPort);
      rosterDataWrapper.addGossipEndpoint(externalIP, externalPort);

      const haProxyFqdn = Templates.renderFullyQualifiedHaProxyName(nodeAlias, namespace);

      // Add service endpoints
      nodeDataWrapper.addServiceEndpoint(haProxyFqdn, constants.GRPC_PORT);
    });
  }

  public static async initialize(
    nodeAliases: NodeAliases,
    keyManager: KeyManager,
    keysDir: string,
    networkNodeServiceMap: Map<string, NetworkNodeServices>,
    adminPublicKeys: string[],
  ): Promise<GenesisNetworkDataConstructor> {
    const adminPublicKeyMap: Map<NodeAlias, string> = new Map();

    const adminPublicKeyIsDefaultValue =
      adminPublicKeys.length === 1 && adminPublicKeys[0] === flags.adminPublicKeys.definition.defaultValue;
    // If admin keys are passed and if it is not the default value from flags then validate and build the adminPublicKeyMap
    if (adminPublicKeys.length > 0 && !adminPublicKeyIsDefaultValue) {
      if (adminPublicKeys.length !== nodeAliases.length) {
        throw new SoloError('Provide a comma separated list of DER encoded ED25519 public keys for each node');
      }

      adminPublicKeys.forEach((key, i) => {
        adminPublicKeyMap[nodeAliases[i]] = key;
      });
    }

    const instance = new GenesisNetworkDataConstructor(
      nodeAliases,
      keyManager,
      keysDir,
      networkNodeServiceMap,
      adminPublicKeyMap,
    );

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
