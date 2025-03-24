// SPDX-License-Identifier: Apache-2.0

import {type CheckedNodesConfigClass, type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';

export interface NodeDownloadGeneratedFilesConfigClass
  extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  cacheDir: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: Client;
  keysDir: string;
  stagingDir: string;
}
