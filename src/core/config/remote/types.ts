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
import type {NodeAliases} from '../../../types/aliases.js';
import type {ComponentType, ConsensusNodeStates} from './enumerations.js';
import type {RemoteConfigMetadata, RemoteConfigMetadataStructure} from './metadata.js';
import type {ComponentsDataWrapper} from './components_data_wrapper.js';
import {CommonFlagsDataWrapper} from './common_flags_data_wrapper.js';

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

export interface RemoteConfigData {
  metadata: RemoteConfigMetadata;
  clusters: Record<Cluster, Namespace>;
  components: ComponentsDataWrapper;
  lastExecutedCommand: string;
  commandHistory: string[];
  flags: CommonFlagsDataWrapper;
}

export type RemoteConfigCommonFlagsStruct = {
  nodeAliasesUnparsed?: string;
  releaseTag?: string;
  relayReleaseTag?: string;
  hederaExplorerVersion?: string;
  mirrorNodeVersion?: string;
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
