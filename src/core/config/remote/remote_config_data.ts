/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type RemoteConfigMetadata} from './metadata.js';
import {type ComponentsDataWrapper} from './components_data_wrapper.js';
import {type CommonFlagsDataWrapper} from './common_flags_data_wrapper.js';
import {type Cluster} from './types.js';
import {type NamespaceName} from '../../kube/namespace_name.js';

export interface RemoteConfigData {
  metadata: RemoteConfigMetadata;
  clusters: Record<Cluster, NamespaceName>;
  components: ComponentsDataWrapper;
  lastExecutedCommand: string;
  commandHistory: string[];
  flags: CommonFlagsDataWrapper;
}
