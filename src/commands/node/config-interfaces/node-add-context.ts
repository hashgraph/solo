// SPDX-License-Identifier: Apache-2.0

import {type NodeAddConfigClass} from './node-add-config-class.js';
import {type PrivateKey} from '@hashgraph/sdk';

export interface NodeAddContext {
  config: NodeAddConfigClass;
  adminKey: PrivateKey;
}
