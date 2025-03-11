// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform, Type} from 'class-transformer';
import {type DeploymentPhase} from '../deployment_phase.js';
import {Transformations} from '../../utils/transformations.js';

@Exclude()
export class ConsensusNodeState {
  @Expose()
  public id: number;

  @Expose()
  public name: string;

  @Expose()
  public namespace: string;

  @Expose()
  public cluster: string;

  @Expose()
  @Transform(Transformations.DeploymentPhase)
  public phase: DeploymentPhase;
}
