// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';

export interface NodeStartConfigClass extends NodeCommonConfigWithNodeAliases {
  app: string;
  cacheDir: string;
  debugNodeAlias: NodeAlias;
  stagingDir: string;
  podRefs: Record<NodeAlias, PodRef>;
  serviceMap: Map<NodeAlias, NetworkNodeServices>;
  allNodeAliases: NodeAliases;
  existingNodeAliases: NodeAliases;
  skipStop: boolean;
}
