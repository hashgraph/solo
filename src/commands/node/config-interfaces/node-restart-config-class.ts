// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';

export interface NodeRestartConfigClass extends NodeCommonConfigWithNodeAliases {
  serviceMap: Map<NodeAlias, NetworkNodeServices>;
  allNodeAliases: NodeAliases;
  existingNodeAliases: NodeAliases;
  podRefs: Record<NodeAlias, PodRef>;
  skipStop: boolean;
}
