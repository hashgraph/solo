// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type CheckedNodesConfigClass, type NodeCommonConfigWithNodeAlias} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';

export interface NodeDeleteConfigClass extends NodeCommonConfigWithNodeAlias, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  endpointType: string;
  soloChartVersion: string;
  localBuildPath: string;
  releaseTag: string;
  adminKey: PrivateKey;
  chartPath: string;
  freezeAdminPrivateKey: string;
  keysDir: string;
  nodeClient: Client;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  curDate: Date;
  refreshedConsensusNodes: ConsensusNode[];
}
