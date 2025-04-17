// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {Transformations} from '../../utils/transformations.js';
import {type DeploymentPhase} from '../deployment-phase.js';

@Exclude()
export class RelayNodeState {
  @Expose()
  public name: string;

  @Expose()
  public namespace: string;

  @Expose()
  public cluster: string;

  @Expose()
  @Transform(Transformations.DeploymentPhase)
  public phase: DeploymentPhase;

  @Expose()
  public consensusNodeIds: number[];

  public constructor(
    name?: string,
    namespace?: string,
    cluster?: string,
    phase?: DeploymentPhase,
    consensusNodeIds?: number[],
  ) {
    this.name = name;
    this.namespace = namespace;
    this.cluster = cluster;
    this.phase = phase;
    this.consensusNodeIds = consensusNodeIds;
  }
}
