/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NodeAliases} from '../../../types/aliases.js';
import {type ComponentType, type ConsensusNodeStates} from './enumerations.js';
import {type NamespaceName} from '../../kube/namespace_name.js';

export type EmailAddress = `${string}@${string}.${string}`;
export type Version = string;
export type Deployment = string;
export type Cluster = string;
export type Context = string;
export type ComponentName = string;

export interface IMigration {
  migratedAt: Date;
  migratedBy: EmailAddress;
  fromVersion: Version;
}

export interface Component {
  name: ComponentName;
  cluster: Cluster;
  namespace: NamespaceName;
}

export interface IRelayComponent extends Component {
  consensusNodeAliases: NodeAliases;
}

export interface IConsensusNodeComponent extends Component {
  state: ConsensusNodeStates;
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
  clusters: Record<Cluster, NamespaceName>;
  components: ComponentsDataStructure;
  commandHistory: string[];
  lastExecutedCommand: string;
  flags: RemoteConfigCommonFlagsStruct;
}

export interface RemoteConfigMetadataStructure {
  name: NamespaceName;
  lastUpdatedAt: Date;
  lastUpdateBy: EmailAddress;
  migration?: IMigration;
}
