// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeStartConfigClass {
  app: string;
  cacheDir: string;
  debugNodeAlias: NodeAlias;
  namespace: NamespaceName;
  deployment: string;
  nodeAliases: NodeAliases;
  stagingDir: string;
  podRefs: Record<NodeAlias, PodRef>;
  nodeAliasesUnparsed: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
