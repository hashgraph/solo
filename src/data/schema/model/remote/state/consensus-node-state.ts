// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {type DeploymentPhase} from '../deployment-phase.js';
import {Transformations} from '../../utils/transformations.js';

@Exclude()
export class ConsensusNodeState {
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
  public id: number;

  public constructor(name?: string, namespace?: string, cluster?: string, phase?: DeploymentPhase, id?: number) {
    this.name = name;
    this.namespace = namespace;
    this.cluster = cluster;
    this.phase = phase;
    this.id = id;
  }
}
