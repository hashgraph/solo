// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeUpgradeConfigClass {
  nodeAliasesUnparsed: string;
  nodeAliases: NodeAliases;
  app: string;
  cacheDir: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  soloChartVersion: string;
  localBuildPath: string;
  namespace: NamespaceName;
  deployment: string;
  releaseTag: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  chartPath: string;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: PrivateKey | string;
  keysDir: string;
  nodeClient: any;
  podRefs: Record<NodeAlias, PodRef>;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  curDate: Date;
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
