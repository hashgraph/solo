// SPDX-License-Identifier: Apache-2.0

import {type NodeCommonConfigWithNodeAlias} from './node-common-config-class.js';

export interface NodeKeysConfigClass extends NodeCommonConfigWithNodeAlias {
  cacheDir: string;
  devMode: boolean;
  generateGossipKeys: boolean;
  generateTlsKeys: boolean;
  curDate: Date;
  keysDir: string;
}
