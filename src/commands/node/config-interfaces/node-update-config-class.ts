// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type NodeCommonConfigWithNodeAlias} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';

export interface NodeUpdateConfigClass extends NodeCommonConfigWithNodeAlias {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  endpointType: string;
  soloChartVersion: string;
  gossipEndpoints: string;
  gossipPrivateKey: string;
  gossipPublicKey: string;
  grpcEndpoints: string;
  localBuildPath: string;
  newAccountNumber: string;
  newAdminKey: PrivateKey;
  releaseTag: string;
  tlsPrivateKey: string;
  tlsPublicKey: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  chartPath: string;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: PrivateKey | string;
  keysDir: string;
  nodeClient: Client;
  podRefs: Record<NodeAlias, PodRef>;
  serviceMap: Map<NodeAlias, NetworkNodeServices>;
  stagingDir: string;
  stagingKeysDir: string;
  treasuryKey: PrivateKey;
  curDate: Date;
  skipStop: boolean;
}
