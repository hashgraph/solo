// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {Transformations} from '../../utils/transformations.js';
import {type DeploymentPhase} from '../deployment_phase.js';

@Exclude()
export class RelayNodeState {
  @Expose()
  public name: string;

  @Expose()
  public namespace: string;

  @Expose()
  public cluster: string;

  @Expose()
  public consensusNodeIds: number[];

  @Expose()
  @Transform(Transformations.DeploymentPhase)
  public phase: DeploymentPhase;

  public constructor(
    name?: string,
    namespace?: string,
    cluster?: string,
    consensusNodeIds?: number[],
    phase?: DeploymentPhase,
  ) {
    this.name = name;
    this.namespace = namespace;
    this.cluster = cluster;
    this.consensusNodeIds = consensusNodeIds;
    this.phase = phase;
  }
}
