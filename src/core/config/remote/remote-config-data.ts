// SPDX-License-Identifier: Apache-2.0

import {type RemoteConfigMetadata} from './metadata.js';
import {type ComponentsDataWrapper} from './components-data-wrapper.js';
import {type CommonFlagsDataWrapper} from './common-flags-data-wrapper.js';
import {type ClusterReference} from './types.js';
import {type Cluster} from './cluster.js';

export interface RemoteConfigData {
  metadata: RemoteConfigMetadata;
  clusters: Record<ClusterReference, Cluster>;
  components: ComponentsDataWrapper;
  lastExecutedCommand: string;
  commandHistory: string[];
  flags: CommonFlagsDataWrapper;
}
