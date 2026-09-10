// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type PrivateKey} from '@hiero-ledger/sdk';
import {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';
import {type NodeCommonConfigWithNodeAlias} from './node-common-config-with-node-alias.js';
import {type Client} from '@hiero-ledger/sdk';
import {type EndpointPortMapping} from '../../../types/index.js';

export interface NodeUpdateConfigClass extends NodeCommonConfigWithNodeAlias, CheckedNodesConfigClass {
  app: string;
  cacheDir: string;
  chartDirectory: string;
  nodeAliases: NodeAliases;
  debugMode: boolean;
  debugNodeAlias: NodeAlias;
  endpointType: string;
  soloChartVersion: string;
  gossipEndpoints: string;
  gossipPrivateKey: string;
  gossipPublicKey: string;
  nodeAliasesUnparsed?: string;
  grpcEndpoints: string;
  localBuildPath: string;
  newAccountNumber: string;
  newAdminKey: PrivateKey;
  releaseTag: string;
  tlsPrivateKey: string;
  tlsPublicKey: string;
  adminKey: PrivateKey;
  chartPath: string;
  freezeAdminPrivateKey: PrivateKey | string;
  keysDir: string;
  nodeClient: Client;
  stagingDir: string;
  treasuryKey: PrivateKey;
  curDate: Date;
  domainNames: string;
  domainNamesMapping: Record<NodeAlias, string>;
  gossipEndpointPort: string;
  gossipEndpointPortMapping: EndpointPortMapping;
  serviceEndpointPort: string;
  serviceEndpointPortMapping: EndpointPortMapping;
}
