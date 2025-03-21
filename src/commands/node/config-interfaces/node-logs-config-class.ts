// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeLogsConfigClass {
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: string[];
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
