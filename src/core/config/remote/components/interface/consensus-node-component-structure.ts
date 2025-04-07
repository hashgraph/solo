// SPDX-License-Identifier: Apache-2.0

import {type BaseComponentStructure} from './base-component-structure.js';
import {type ConsensusNodeStates} from '../../enumerations/consensus-node-states.js';

export interface ConsensusNodeComponentStructure extends BaseComponentStructure {
  nodeId: number;
  nodeState: ConsensusNodeStates;
}
