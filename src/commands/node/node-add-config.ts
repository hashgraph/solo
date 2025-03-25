// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import {type PodRef} from '../../integration/kube/resources/pod/pod-ref.js';
import {type NetworkNodeServices} from '../../core/network-node-services.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type NamespaceName} from '../../integration/kube/resources/namespace/namespace-name.js';
import {type ConsensusNode} from '../../core/model/consensus-node.js';

export interface NodeAddConfigClass {
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
  namespace: NamespaceName;
  deployment: string;
  nodeAlias: NodeAlias;
  releaseTag: string;
  adminKey: PrivateKey;
  allNodeAliases: NodeAliases;
  curDate: Date;
  existingNodeAliases: NodeAliases;
  freezeAdminPrivateKey: string;
  keysDir: string;
  lastStateZipPath: string;
  nodeClient: any;
  podRefs: Record<NodeAlias, PodRef>;
  serviceMap: Map<string, NetworkNodeServices>;
  treasuryKey: PrivateKey;
  stagingDir: string;
  stagingKeysDir: string;
  grpcTlsCertificatePath: string;
  grpcWebTlsCertificatePath: string;
  grpcTlsKeyPath: string;
  grpcWebTlsKeyPath: string;
  haproxyIps: string;
  envoyIps: string;
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
