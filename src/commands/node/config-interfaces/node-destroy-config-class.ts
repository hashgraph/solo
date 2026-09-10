// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PrivateKey} from '@hiero-ledger/sdk';
import {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';
import {type NodeCommonConfigWithNodeAlias} from './node-common-config-with-node-alias.js';
import {type Client} from '@hiero-ledger/sdk';
import {type ConsensusNode} from '../../../core/model/consensus-node.js';
import {type EndpointPortMapping} from '../../../types/index.js';

export interface NodeDestroyConfigClass extends NodeCommonConfigWithNodeAlias, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  debugMode: boolean;
  debugNodeAlias: NodeAlias;
  nodeAliases: NodeAliases;
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
  treasuryKey: PrivateKey;
  curDate: Date;
  refreshedConsensusNodes: ConsensusNode[];
  domainNames: string;
  domainNamesMapping: Record<NodeAlias, string>;
  gossipEndpointPort: string;
  gossipEndpointPortMapping: EndpointPortMapping;
  serviceEndpointPort: string;
  serviceEndpointPortMapping: EndpointPortMapping;
  nodeAliasesUnparsed?: string;
}
