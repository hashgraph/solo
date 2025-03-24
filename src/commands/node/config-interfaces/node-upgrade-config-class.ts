// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';

export interface NodeUpgradeConfigClass extends NodeCommonConfigWithNodeAliases {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  soloChartVersion: string;
  localBuildPath: string;
  releaseTag: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  chartPath: string;
  serviceMap: Map<NodeAlias, NetworkNodeServices>;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: PrivateKey | string;
  keysDir: string;
  nodeClient: Client;
  podRefs: Record<NodeAlias, PodRef>;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  curDate: Date;
  skipStop: boolean;
}
