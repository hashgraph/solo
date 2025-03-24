// SPDX-License-Identifier: Apache-2.0

import {type NodeAddConfigClass} from './node-add-config-class.js';
import {type PrivateKey, type ServiceEndpoint} from '@hashgraph/sdk';

export interface NodeAddContext {
  config: NodeAddConfigClass;
  adminKey: PrivateKey;
  newNode: {
    accountId: string;
  };
  gossipEndpoints: ServiceEndpoint[];
  grpcServiceEndpoints: ServiceEndpoint[];
  signingCertDer: Uint8Array;
  tlsCertHash: Uint8Array;
}
