// SPDX-License-Identifier: Apache-2.0

import {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';

export interface NodeFreezeConfigClass extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  freezeAdminPrivateKey: string;
  freezeBlockDrainSeconds: number;
}
