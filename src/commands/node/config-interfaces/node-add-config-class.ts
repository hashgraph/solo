// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PrivateKey} from '@hiero-ledger/sdk';
import {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';
import {type NodeCommonConfigWithNodeAlias} from './node-common-config-with-node-alias.js';
import {type Client} from '@hiero-ledger/sdk';
import {type ClusterReferenceName, type EndpointPortMapping} from '../../../types/index.js';

export interface NodeAddConfigClass extends NodeCommonConfigWithNodeAlias, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  chainId: string;
  chartDirectory: string;
  debugMode: boolean;
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
  newNodeAliases: NodeAliases;
  nodeAliases: NodeAliases;
  curDate: Date;
  freezeAdminPrivateKey: string;
  keysDir: string;
  lastStateZipPath: string;
  nodeClient: Client;
  treasuryKey: PrivateKey;
  stagingDir: string;
  grpcTlsCertificatePath: string;
  grpcWebTlsCertificatePath: string;
  grpcTlsKeyPath: string;
  grpcWebTlsKeyPath: string;
  haproxyIps: string;
  envoyIps: string;
  clusterRef: ClusterReferenceName;
  domainNames: string;
  domainNamesMapping: Record<NodeAlias, string>;
  gossipEndpointPort: string;
  gossipEndpointPortMapping: EndpointPortMapping;
  serviceEndpointPort: string;
  serviceEndpointPortMapping: EndpointPortMapping;
  nodeAliasesUnparsed?: string;
}
