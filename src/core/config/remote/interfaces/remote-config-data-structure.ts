// SPDX-License-Identifier: Apache-2.0

import {type ClusterStructure} from './cluster-structure.js';
import {type RemoteConfigCommonFlagsStruct} from './remote-config-common-flags-struct.js';
import {type ClusterReference, type Version} from '../types.js';
import {type RemoteConfigMetadataStructure} from './remote-config-metadata-structure.js';
import {type ComponentsDataStructure} from './components-data-structure.js';

export interface RemoteConfigDataStructure {
  metadata: RemoteConfigMetadataStructure;
  version: Version;
  clusters: Record<ClusterReference, ClusterStructure>;
  components: ComponentsDataStructure;
  commandHistory: string[];
  lastExecutedCommand: string;
  flags: RemoteConfigCommonFlagsStruct;
}
