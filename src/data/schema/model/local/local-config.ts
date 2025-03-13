// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform, Type} from 'class-transformer';
import {SemVer} from 'semver';
import {Deployment} from './deployment.js';
import {Transformations} from '../utils/transformations.js';
import {UserIdentity} from '../common/user-identity.js';

@Exclude()
export class LocalConfig {
  @Expose()
  public schemaVersion: number;

  @Expose()
  @Transform(Transformations.SemVer)
  public soloVersion: SemVer;

  @Expose()
  @Type(() => UserIdentity)
  public userIdentity: UserIdentity;

  @Expose()
  @Type(() => Deployment)
  public deployments: Deployment[];

  @Expose()
  @Type(() => Map)
  public clusterRefs: Map<string, string>;

  constructor(
    schemaVersion?: number,
    soloVersion?: SemVer,
    deployments?: Deployment[],
    clusterRefs?: Map<string, string>,
    userIdentity?: UserIdentity,
  ) {
    this.schemaVersion = schemaVersion || 1;
    this.soloVersion = soloVersion || new SemVer('0.0.0');
    this.deployments = deployments || [];
    this.clusterRefs = clusterRefs || new Map<string, string>();
    this.userIdentity = userIdentity || new UserIdentity();
  }
}
