// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type NodeAliases} from '../../../types/aliases.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeDownloadGeneratedFilesConfigClass {
  cacheDir: string;
  namespace: NamespaceName;
  deployment: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: any;
  existingNodeAliases: NodeAliases;
  allNodeAliases: NodeAliases[];
  serviceMap: Map<string, NetworkNodeServices>;
  consensusNodes: ConsensusNode[];
  contexts: string[];
  keysDir: string;
  stagingDir: string;
}
