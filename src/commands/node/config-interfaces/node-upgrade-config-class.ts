// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type PrivateKey} from '@hiero-ledger/sdk';
import {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';
import {type Client} from '@hiero-ledger/sdk';

export interface NodeUpgradeConfigClass extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  debugMode: boolean;
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
  treasuryKey: PrivateKey;
  curDate: Date;
  upgradeVersion: string;

  // Node Config Flags
  apiPermissionProperties: string;
  applicationEnv: string;
  applicationProperties: string;
  bootstrapProperties: string;
  log4j2Xml: string;
  settingTxt: string;

  // Flags used for chart upgrades
  valuesFile: string;

  freezeBlockDrainSeconds: number;
  skipNodeStart: boolean;
}
