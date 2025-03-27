// SPDX-License-Identifier: Apache-2.0

import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';

export interface NodePrepareUpgradeConfigClass extends NodeCommonConfigWithNodeAliases {
  cacheDir: string;
  releaseTag: string;
  freezeAdminPrivateKey: string;
  nodeClient: Client;
}
