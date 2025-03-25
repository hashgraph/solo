// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {Transformations} from '../../utils/transformations.js';
import {type DeploymentPhase} from '../deployment-phase.js';

@Exclude()
export class BlockNodeState {
  @Expose()
  public name: string;

  @Expose()
  public namespace: string;

  @Expose()
  public cluster: string;

  @Expose()
  @Transform(Transformations.DeploymentPhase)
  public phase: DeploymentPhase;

  public constructor(name?: string, namespace?: string, cluster?: string, phase?: DeploymentPhase) {
    this.name = name;
    this.namespace = namespace;
    this.cluster = cluster;
    this.phase = phase;
  }
}
