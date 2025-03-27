// SPDX-License-Identifier: Apache-2.0

import {type NodeAddConfigClass} from './node-add-config-class.js';
import {type Long, type PrivateKey, type ServiceEndpoint} from '@hashgraph/sdk';
import {type NodeAlias} from '../../../types/aliases.js';

export interface NodeAddContext {
  config: NodeAddConfigClass;
  adminKey: PrivateKey;
  newNode: {accountId: string; name: NodeAlias};
  maxNum: Long;
  gossipEndpoints: ServiceEndpoint[];
  grpcServiceEndpoints: ServiceEndpoint[];
  signingCertDer: Uint8Array;
  tlsCertHash: Uint8Array;
  upgradeZipHash: string;
}
