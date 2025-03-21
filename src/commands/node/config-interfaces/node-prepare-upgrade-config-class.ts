// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodePrepareUpgradeConfigClass {
  cacheDir: string;
  namespace: NamespaceName;
  deployment: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: any;
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
