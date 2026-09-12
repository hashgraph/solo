// SPDX-License-Identifier: Apache-2.0

import {type NodeAlias} from '../../../types/aliases.js';
import {type CheckedNodesConfigClass} from './checked-nodes-config-class.js';
import {type NodeCommonConfigWithNodeAliases} from './node-common-config-with-node-aliases.js';
import {type Optional} from '../../../types/index.js';
import {type PrivateKey} from '@hiero-ledger/sdk';

export interface NodeStartConfigClass extends NodeCommonConfigWithNodeAliases, CheckedNodesConfigClass {
  adminKey: PrivateKey;
  app: string;
  cacheDir: string;
  debugNodeAlias: NodeAlias;
  stagingDir: string;
  forcePortForward: Optional<boolean>;
  grpcWebEndpoints: string;
  /** Set by checkAllNodesAreActiveOrFrozen: true when every node settled in FREEZE_COMPLETE rather than ACTIVE. */
  restoredFromFreezeState?: boolean;
}
