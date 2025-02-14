/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NodeAliases} from '../../../types/aliases.js';
import {type ComponentType, type ConsensusNodeStates} from './enumerations.js';

export type EmailAddress = `${string}@${string}.${string}`;
export type Version = string;
/// TODO - see if we can use NamespaceName and use some annotations and overrides to covert to strings
export type NamespaceNameAsString = string;
export type DeploymentName = string;
export type Context = string;
export type ComponentName = string;

export type ClusterRef = string;
export type ClusterRefs = Record<ClusterRef, Context>;

export interface IMigration {
  migratedAt: Date;
  migratedBy: EmailAddress;
  fromVersion: Version;
}

export interface Component {
  name: ComponentName;
  cluster: ClusterRef;
  namespace: NamespaceNameAsString;
}

export interface IRelayComponent extends Component {
  consensusNodeAliases: NodeAliases;
}

export interface IConsensusNodeComponent extends Component {
  nodeId: number;
  state: ConsensusNodeStates;
}

export interface ICluster {
  name: string;
  namespace: string;
  dnsBaseDomain: string;
  dnsConsensusNodePattern: string;
}

export type ComponentsDataStructure = Record<ComponentType, Record<ComponentName, Component>>;

export type RemoteConfigCommonFlagsStruct = {
  releaseTag?: string;
  chartDirectory?: string;
  relayReleaseTag?: string;
  soloChartVersion?: string;
  mirrorNodeVersion?: string;
  nodeAliasesUnparsed?: string;
  hederaExplorerVersion?: string;
};

export interface RemoteConfigDataStructure {
  metadata: RemoteConfigMetadataStructure;
  version: Version;
  clusters: Record<ClusterRef, ICluster>;
  components: ComponentsDataStructure;
  commandHistory: string[];
  lastExecutedCommand: string;
  flags: RemoteConfigCommonFlagsStruct;
}

export interface RemoteConfigMetadataStructure {
  name: NamespaceNameAsString;
  lastUpdatedAt: Date;
  lastUpdateBy: EmailAddress;
  migration?: IMigration;
}
