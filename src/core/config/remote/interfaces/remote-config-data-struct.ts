// SPDX-License-Identifier: Apache-2.0

import {type ClusterStruct} from './cluster-struct.js';
import {type RemoteConfigCommonFlagsStruct} from './remote-config-common-flags-struct.js';
import {type ClusterReference, type Version} from '../types.js';
import {type RemoteConfigMetadataStruct} from './remote-config-metadata-struct.js';
import {type ComponentsDataStruct} from './components-data-struct.js';

export interface RemoteConfigDataStruct {
  metadata: RemoteConfigMetadataStruct;
  version: Version;
  clusters: Record<ClusterReference, ClusterStruct>;
  components: ComponentsDataStruct;
  commandHistory: string[];
  lastExecutedCommand: string;
  flags: RemoteConfigCommonFlagsStruct;
}
