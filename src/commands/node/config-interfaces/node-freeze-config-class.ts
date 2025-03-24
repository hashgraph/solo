// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';

export interface NodeFreezeConfigClass extends NodeCommonConfigWithNodeAliases {
  namespace: NamespaceName;
  deployment: string;
  consensusNodes: ConsensusNode[];
  serviceMap: Map<NodeAlias, NetworkNodeServices>;
  allNodeAliases: NodeAliases;
  existingNodeAliases: NodeAliases;
  podRefs: Record<NodeAlias, PodRef>;
  contexts: string[];
  freezeAdminPrivateKey: string;
  skipStop: boolean;
}
