// SPDX-License-Identifier: Apache-2.0

import {type BaseComponentStruct} from './base-component-struct.js';
import {type NodeId} from '../../../../../types/aliases.js';

export interface RelayComponentStruct extends BaseComponentStruct {
  consensusNodeIds: NodeId[];
}
