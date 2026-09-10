// SPDX-License-Identifier: Apache-2.0

import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';

export interface NodeKeysConfigClass extends NodeCommonConfigWithNodeAliases {
  cacheDir: string;
  debugMode: boolean;
  generateGossipKeys: boolean;
  generateTlsKeys: boolean;
  curDate: Date;
  keysDir: string;
}
