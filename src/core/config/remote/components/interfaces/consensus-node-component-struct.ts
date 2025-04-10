// SPDX-License-Identifier: Apache-2.0

import {type BaseComponentStruct} from './base-component-struct.js';
import {type ConsensusNodeStates} from '../../enumerations/consensus-node-states.js';

export interface ConsensusNodeComponentStruct extends BaseComponentStruct {
  nodeId: number;
  nodeState: ConsensusNodeStates;
}
