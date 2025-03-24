// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PodRef} from '../../../integration/kube/resources/pod/pod-ref.js';
import {type NetworkNodeServices} from '../../../core/network-node-services.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type NodeCommonConfigWithNodeAlias} from './node-common-config-class.js';
import {type Client} from '@hashgraph/sdk';

export interface NodeAddConfigClass extends NodeCommonConfigWithNodeAlias {
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
  chartPath: string;
  curDate: Date;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: string;
  keysDir: string;
  lastStateZipPath: string;
  nodeClient: Client;
  podRefs: Record<NodeAlias, PodRef>;
  serviceMap: Map<NodeAlias, NetworkNodeServices>;
  treasuryKey: PrivateKey;
  stagingDir: string;
  stagingKeysDir: string;
  grpcTlsCertificatePath: string;
  grpcWebTlsCertificatePath: string;
  grpcTlsKeyPath: string;
  grpcWebTlsKeyPath: string;
  haproxyIps: string;
  envoyIps: string;
  skipStop: boolean;
}
