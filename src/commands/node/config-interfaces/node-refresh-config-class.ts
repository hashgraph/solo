// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeRefreshConfigClass {
  app: string;
  cacheDir: string;
  devMode: boolean;
  localBuildPath: string;
  namespace: NamespaceName;
  deployment: string;
  nodeAliasesUnparsed: string;
  releaseTag: string;
  nodeAliases: NodeAliases;
  podRefs: Record<NodeAlias, PodRef>;
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
