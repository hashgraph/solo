// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';
import {type EndpointPortMapping, type Optional} from '../../../types/index.js';
import {type PrivateKey} from '@hiero-ledger/sdk';

export interface NodeStartConfigClass extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  adminKey: PrivateKey;
  app: string;
  cacheDir: string;
  debugNodeAlias: NodeAlias;
  stagingDir: string;
  forcePortForward: Optional<boolean>;
  grpcWebEndpoints: string;
  stateFile: string;
  transplant: Optional<boolean>;
  // Endpoint overrides the override roster must reproduce; see START_FLAGS for why they are repeated
  // here. Optional rather than required-with-undefined: a plain start supplies none of them.
  domainNames?: string;
  domainNamesMapping?: Record<NodeAlias, string>;
  gossipEndpointPort?: string;
  gossipEndpointPortMapping?: EndpointPortMapping;
  serviceEndpointPort?: string;
  serviceEndpointPortMapping?: EndpointPortMapping;
}
