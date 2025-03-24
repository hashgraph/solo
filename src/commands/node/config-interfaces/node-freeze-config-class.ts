// SPDX-License-Identifier: Apache-2.0

import {type CheckedNodesConfigClass, type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';

export interface NodeFreezeConfigClass extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  freezeAdminPrivateKey: string;
}
