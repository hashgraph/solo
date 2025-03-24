// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type CheckedNodesConfigClass, type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';

export interface NodeUpgradeConfigClass extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  soloChartVersion: string;
  localBuildPath: string;
  releaseTag: string;
  adminKey: PrivateKey;
  chartPath: string;
  freezeAdminPrivateKey: PrivateKey | string;
  keysDir: string;
  nodeClient: Client;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  curDate: Date;
}
