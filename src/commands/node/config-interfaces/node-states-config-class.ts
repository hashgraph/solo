// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type NodeAliases} from '../../../types/aliases.js';

export interface NodeStatesConfigClass {
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
