/**
 * SPDX-License-Identifier: Apache-2.0
 */
import type {RemoteConfigMetadata} from './metadata.js';
import type {ComponentsDataWrapper} from './components_data_wrapper.js';
import type {CommonFlagsDataWrapper} from './common_flags_data_wrapper.js';
import type {Cluster, Namespace} from './types.js';

export interface RemoteConfigData {
  metadata: RemoteConfigMetadata;
  clusters: Record<Cluster, Namespace>;
  components: ComponentsDataWrapper;
  lastExecutedCommand: string;
  commandHistory: string[];
  flags: CommonFlagsDataWrapper;
}
