// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeCommonConfigClass {
  namespace: NamespaceName;
  deployment: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  quiet: boolean;
}

export interface NodeCommonConfigWithNodeAliases {
  nodeAliases: NodeAliases;
  nodeAliasesUnparsed: string;
}

export interface NodeCommonConfigWithNodeAlias {
  nodeAlias: NodeAlias;
}
