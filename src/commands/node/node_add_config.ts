/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import {type PodRef} from '../../core/kube/resources/pod/pod_ref.js';
import {type NetworkNodeServices} from '../../core/network_node_services.js';
import {type PrivateKey} from '@hashgraph/sdk';
import {type NamespaceName} from '../../core/kube/resources/namespace/namespace_name.js';
import {type ConsensusNode} from '../../core/model/consensus_node.js';

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
  chartPath: string;
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
  getUnusedConfigs: () => string[];
  consensusNodes: ConsensusNode[];
  contexts: string[];
}
