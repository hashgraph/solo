// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';

export interface NodeCommonConfigClass {
  namespace: NamespaceName;
  deployment: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  quiet: boolean;
}

export interface NodeCommonConfigWithNodeAliases extends NodeCommonConfigClass {
  nodeAliases: NodeAliases;
  nodeAliasesUnparsed: string;
}

export interface NodeCommonConfigWithNodeAlias extends NodeCommonConfigClass {
  nodeAlias: NodeAlias;
}

export interface CheckedNodesConfigClass extends NodeCommonConfigClass {
  podRefs: Record<NodeAlias, PodRef>;
  skipStop: boolean;
  existingNodeAliases: NodeAliases;
  allNodeAliases: NodeAliases;
  serviceMap: Map<NodeAlias, NetworkNodeServices>;
}

export interface CheckedNodesContext {
  config: CheckedNodesConfigClass;
}
