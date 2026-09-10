// SPDX-License-Identifier: Apache-2.0

import {AccountId, PrivateKey, PublicKey} from '@hiero-ledger/sdk';
import {GenesisNetworkNodeDataWrapper} from './genesis-network-node-data-wrapper.js';
import * as constants from '../constants.js';

import {type KeyManager} from '../key-manager.js';
import {type EndpointPortMapping, type ToJSON} from '../../types/index.js';
import {type JsonString, type NodeAlias} from '../../types/aliases.js';
import {GenesisNetworkRosterEntryDataWrapper} from './genesis-network-roster-entry-data-wrapper.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {Flags as flags} from '../../commands/flags.js';
import {Templates} from '../templates.js';
import {type AccountManager} from '../account-manager.js';
import {type ConsensusNode} from '../model/consensus-node.js';
import {type NodeServiceMapping} from '../../types/mappings/node-service-mapping.js';
import {type NetworkNodeServices} from '../network-node-services.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';

/**
 * Used to construct the nodes data and convert them to JSON
 */
export class GenesisNetworkDataConstructor implements ToJSON {
  public readonly nodes: Record<NodeAlias, GenesisNetworkNodeDataWrapper> = {};
  public readonly rosters: Record<NodeAlias, GenesisNetworkRosterEntryDataWrapper> = {};
  private readonly initializationPromise: Promise<void>;

  private constructor(
    private readonly consensusNodes: ConsensusNode[],
    private readonly keyManager: KeyManager,
    private readonly accountManager: AccountManager,
    public networkNodeServiceMap: NodeServiceMapping,
    public adminPublicKeyMap: Map<NodeAlias, string>,
    public domainNamesMapping?: Record<NodeAlias, string>,
    public gossipEndpointPortMapping?: EndpointPortMapping,
    public serviceEndpointPortMapping?: EndpointPortMapping,
  ) {
    this.initializationPromise = (async (): Promise<void> => {
      for (const consensusNode of consensusNodes) {
        let adminPublicKey: PublicKey;
        const networkNodeService: NetworkNodeServices = this.networkNodeServiceMap.get(consensusNode.name);
        const accountId: AccountId = AccountId.fromString(networkNodeService.accountId);
        const namespace: NamespaceName = networkNodeService.namespace;

        if (adminPublicKeyMap.has(consensusNode.name as NodeAlias)) {
          try {
            if (PublicKey.fromStringED25519(adminPublicKeyMap.get(consensusNode.name))) {
              adminPublicKey = PublicKey.fromStringED25519(adminPublicKeyMap.get(consensusNode.name));
            }
          } catch {
            // Ignore error
          }
        }

        try {
          // not found existing one, generate a new key, and save to k8s secret
          if (!adminPublicKey) {
            const newKey: PrivateKey = PrivateKey.generateED25519();
            adminPublicKey = newKey.publicKey;
            try {
              await this.accountManager.createOrReplaceAccountKeySecret(newKey, accountId, false, namespace);
            } catch {
              throw new SoloErrors.component.genesisAdminKeySecretFailed(accountId.toString());
            }
          }

          const nodeDataWrapper: GenesisNetworkNodeDataWrapper = new GenesisNetworkNodeDataWrapper(
            +networkNodeService.nodeId,
            adminPublicKey,
            consensusNode.name,
          );
          this.nodes[consensusNode.name] = nodeDataWrapper;
          nodeDataWrapper.accountId = accountId;

          const rosterDataWrapper: GenesisNetworkRosterEntryDataWrapper = new GenesisNetworkRosterEntryDataWrapper(
            +networkNodeService.nodeId,
          );
          this.rosters[consensusNode.name] = rosterDataWrapper;
          rosterDataWrapper.weight = this.nodes[consensusNode.name].weight = constants.HEDERA_NODE_DEFAULT_STAKE_AMOUNT;

          const externalPort: number = Templates.resolveEndpointPort(
            gossipEndpointPortMapping,
            consensusNode.name,
            +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
          );
          // Add gossip endpoints
          nodeDataWrapper.addGossipEndpoint(networkNodeService.externalAddress, externalPort);
          rosterDataWrapper.addGossipEndpoint(networkNodeService.externalAddress, externalPort);

          const domainName: string = domainNamesMapping?.[consensusNode.name];
          const servicePort: number = Templates.resolveEndpointPort(
            serviceEndpointPortMapping,
            consensusNode.name,
            constants.GRPC_PORT,
          );

          // Add service endpoints
          nodeDataWrapper.addServiceEndpoint(domainName ?? networkNodeService.externalAddress, servicePort);
          nodeDataWrapper.addServiceEndpoint(domainName ?? networkNodeService.externalAddress, servicePort + 1);
        } catch (error) {
          throw new SoloErrors.component.genesisDataGenerationFailed(error);
        }
      }
    })();
  }

  public static async initialize(
    consensusNodes: ConsensusNode[],
    keyManager: KeyManager,
    accountManager: AccountManager,
    networkNodeServiceMap: NodeServiceMapping,
    adminPublicKeys: string[],
    domainNamesMapping?: Record<NodeAlias, string>,
    gossipEndpointPortMapping?: EndpointPortMapping,
    serviceEndpointPortMapping?: EndpointPortMapping,
  ): Promise<GenesisNetworkDataConstructor> {
    const adminPublicKeyMap: Map<NodeAlias, string> = new Map();

    let adminPublicKeyIsDefaultValue: boolean = true;
    for (const publicKey of adminPublicKeys) {
      if (publicKey !== flags.adminPublicKeys.definition.defaultValue) {
        adminPublicKeyIsDefaultValue = false;
      }
    }

    // If admin keys are passed and if it is not the default value from flags then validate and build the adminPublicKeyMap
    if (adminPublicKeys.length > 0 && !adminPublicKeyIsDefaultValue) {
      if (adminPublicKeys.length !== consensusNodes.length) {
        throw new SoloErrors.validation.adminKeysCountMismatch(adminPublicKeys.length, consensusNodes.length);
      }

      for (const [index, key] of adminPublicKeys.entries()) {
        adminPublicKeyMap.set(consensusNodes[index].name, key);
      }
    }

    const instance = new GenesisNetworkDataConstructor(
      consensusNodes,
      keyManager,
      accountManager,
      networkNodeServiceMap,
      adminPublicKeyMap,
      domainNamesMapping,
      gossipEndpointPortMapping,
      serviceEndpointPortMapping,
    );

    await instance.load();

    return instance;
  }

  /**
   * Loads the gossipCaCertificate and grpcCertificateHash
   */
  private async load() {
    await this.initializationPromise;
    await Promise.all(
      this.consensusNodes.map(async consensusNode => {
        const signingCertPem: string = await this.accountManager.getGossipPublicKeyPem(consensusNode);
        const derCertificate = this.keyManager.getDerFromPem(signingCertPem);

        //* Assign the DER formatted certificate
        this.rosters[consensusNode.name].gossipCaCertificate = this.nodes[consensusNode.name].gossipCaCertificate =
          Buffer.from(derCertificate).toString('base64');

        //* Generate the SHA-384 hash
        this.nodes[consensusNode.name].grpcCertificateHash = '';
      }),
    );
  }

  public toJSON(): JsonString {
    const nodeMetadata = [];
    for (const nodeAlias of Object.keys(this.nodes)) {
      nodeMetadata.push({
        node: this.nodes[nodeAlias].toObject(),
        rosterEntry: this.rosters[nodeAlias].toObject(),
      });
    }

    return JSON.stringify({nodeMetadata: nodeMetadata});
  }
}
