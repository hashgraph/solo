// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type NodeCommonConfigWithNodeAlias} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';

export interface NodeDeleteConfigClass extends NodeCommonConfigWithNodeAlias {
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
  allNodeAliases: NodeAliases;
  chartPath: string;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: string;
  keysDir: string;
  nodeClient: Client;
  podRefs: Record<NodeAlias, PodRef>;
  serviceMap: Map<string, NetworkNodeServices>;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  curDate: Date;
  skipStop: boolean;
}
