// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {ConsensusNodeState} from './state/consensus_node_state.js';

@Exclude()
export class DeploymentState {
  @Expose()
  @Type(() => ConsensusNodeState)
  public consensusNodes: ConsensusNodeState[];
}
