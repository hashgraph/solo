// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type CheckedNodesConfigClass, type NodeCommonConfigWithNodeAlias} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';
import {type ClusterReference} from '../../../core/config/remote/types.js';

export interface NodeAddConfigClass extends NodeCommonConfigWithNodeAlias, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  chainId: string;
  chartDirectory: string;
  devMode: boolean;
  debugNodeAlias: NodeAlias;
  endpointType: string;
  soloChartVersion: string;
  generateGossipKeys: boolean;
  generateTlsKeys: boolean;
  gossipEndpoints: string;
  grpcEndpoints: string;
  localBuildPath: string;
  releaseTag: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  curDate: Date;
  freezeAdminPrivateKey: string;
  keysDir: string;
  lastStateZipPath: string;
  nodeClient: Client;
  treasuryKey: PrivateKey;
  stagingDir: string;
  stagingKeysDir: string;
  grpcTlsCertificatePath: string;
  grpcWebTlsCertificatePath: string;
  grpcTlsKeyPath: string;
  grpcWebTlsKeyPath: string;
  haproxyIps: string;
  envoyIps: string;
  clusterRef: ClusterReference;
  domainNames: string;
  domainNamesMapping: Record<NodeAlias, string>;
}
