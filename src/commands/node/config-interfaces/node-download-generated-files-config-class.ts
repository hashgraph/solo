// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';

export interface NodeDownloadGeneratedFilesConfigClass extends NodeCommonConfigWithNodeAliases {
  cacheDir: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: Client;
  existingNodeAliases: NodeAliases;
  allNodeAliases: NodeAliases;
  serviceMap: Map<string, NetworkNodeServices>;
  podRefs: Record<NodeAlias, PodRef>;
  keysDir: string;
  stagingDir: string;
  skipStop: boolean;
}
