// SPDX-License-Identifier: Apache-2.0

import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';

export interface NodeKeysConfigClass extends NodeCommonConfigWithNodeAliases {
  cacheDir: string;
  devMode: boolean;
  generateGossipKeys: boolean;
  generateTlsKeys: boolean;
  curDate: Date;
  keysDir: string;
}
