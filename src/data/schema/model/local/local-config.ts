// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {Deployment} from './deployment.js';
import {UserIdentity} from '../common/user-identity.js';
import {Version} from '../../../../business/utils/version.js';
import {ApplicationVersions} from '../common/application-versions.js';

@Exclude()
export class LocalConfig {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type(() => ApplicationVersions)
  public versions: ApplicationVersions;

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
    versions?: ApplicationVersions,
    deployments?: Deployment[],
    clusterRefs?: Map<string, string>,
    userIdentity?: UserIdentity,
  ) {
    this.schemaVersion = schemaVersion ?? 1;
    this.versions = versions ?? new ApplicationVersions();
    this.deployments = deployments ?? [];
    this.clusterRefs = clusterRefs ?? new Map<string, string>();
    this.userIdentity = userIdentity ?? new UserIdentity();
  }
}
