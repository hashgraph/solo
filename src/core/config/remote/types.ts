/**
 * SPDX-License-Identifier: Apache-2.0
 */
import type {NodeAliases} from '../../../types/aliases.js';
import type {ComponentType, ConsensusNodeStates} from './enumerations.js';

export type EmailAddress = `${string}@${string}.${string}`;
export type Version = string;
export type Namespace = string;
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
  namespace: Namespace;
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
  clusters: Record<Cluster, Namespace>;
  components: ComponentsDataStructure;
  commandHistory: string[];
  lastExecutedCommand: string;
  flags: RemoteConfigCommonFlagsStruct;
}

export interface RemoteConfigMetadataStructure {
  name: Namespace;
  lastUpdatedAt: Date;
  lastUpdateBy: EmailAddress;
  migration?: IMigration;
}
