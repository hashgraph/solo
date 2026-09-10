// SPDX-License-Identifier: Apache-2.0

import {type ListrTask, type ListrTaskWrapper} from 'listr2';
import {type NodeAlias} from './aliases.js';
import {type Listr} from 'listr2';
import {type NamespaceName} from './namespace/namespace-name.js';
import {type PortForwardConfig} from './port-forward-config.js';

// NOTE: DO NOT add any Solo imports in this file to avoid circular dependencies

export type {NodeKeyObject} from './node-key-object.js';
export type {PrivateKeyAndCertificateObject} from './private-key-and-certificate-object.js';
export type {ExtendedNetServer} from './extended-net-server.js';
export type {LocalContextObject} from './local-context-object.js';
export type {AccountIdWithKeyPairObject} from './account-id-with-key-pair-object.js';
export type {ToObject} from './to-object.js';
export type {ToJSON} from './to-json.js';
export type {ServiceEndpoint} from './service-endpoint.js';
export type {NodeAccountId} from './node-account-id.js';
export type {GenesisNetworkNodeStructure} from './genesis-network-node-structure.js';
export type {GenesisNetworkRosterStructure} from './genesis-network-roster-structure.js';
export type {GossipEndpoint} from './gossip-endpoint.js';
export type {PortForwardConfig} from './port-forward-config.js';
export type {CommandDefinition} from './command-definition.js';
export type {GitHubReleaseAsset} from './git-hub-release-asset.js';
export type {GitHubRelease} from './git-hub-release.js';
export type {ReleaseInfo} from './release-info.js';

/**
 * Generic type for representing optional types
 */
export type Optional<T> = T | undefined;

export type SoloListrTask<T> = ListrTask<T, any, any>;

export type SoloListrTaskWrapper<T> = ListrTaskWrapper<T, any, any>;

export type SoloListr<T> = Listr<T, any, any>;

export type ComponentDisplayName = 'Consensus node' | 'Mirror node' | 'Explorer node' | 'Relay node' | 'Block node';

export enum PodmanMode {
  ROOTLESS = 'rootless',
  ROOTFUL = 'rootful',
  VIRTUAL_MACHINE = 'virtual-machine',
}

export type ComponentData = {
  clusterReference: ClusterReferenceName;
  contextName: Context;
  componentId: ComponentId;
  namespace: NamespaceName;
  portForwards: Optional<PortForwardConfig[]>;
  componentDisplayName: ComponentDisplayName;
};

export type InitDependenciesOptions = {deps: string[]; createCluster: boolean; useSmallMemoryCluster?: boolean};

export type Version = string;
/// TODO - see if we can use NamespaceName and use some annotations and overrides to covert to strings
export type NamespaceNameAsString = string;
export type Context = string;
export type ComponentId = number;
export type DeploymentName = string;
export type Realm = number | Long;
export type Shard = number | Long;
export type ClusterReferenceName = string;
export type ClusterReferences = Map<ClusterReferenceName, Context>;
export type PriorityMapping = [blockNodeId: ComponentId, priority: number];
export type NodeAliasToAddressMapping = Record<NodeAlias, {address: string; port: number}>;
/**
 * A port override for a consensus node endpoint. `defaultPort` applies to every consensus node that has no entry in
 * `nodeAliasToPort`; both are undefined/empty when the user did not supply an override.
 */
export type EndpointPortMapping = {defaultPort?: number; nodeAliasToPort: Record<NodeAlias, number>};
