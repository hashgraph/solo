// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {RemoteConfigMetadata} from './remote-config-metadata.js';
import {ApplicationVersions} from '../common/application-versions.js';
import {Cluster} from '../common/cluster.js';
import {DeploymentState} from './deployment-state.js';
import {DeploymentHistory} from './deployment-history.js';
import {Version} from '../../../../business/utils/version.js';

@Exclude()
export class RemoteConfig {
  public static readonly SCHEMA_VERSION: Version<number> = new Version(1);

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type(() => RemoteConfigMetadata)
  public metadata: RemoteConfigMetadata;

  @Expose()
  @Type(() => ApplicationVersions)
  public versions: ApplicationVersions;

  @Expose()
  @Type(() => Cluster)
  public clusters: Cluster[];

  @Expose()
  @Type(() => DeploymentState)
  public state: DeploymentState;

  @Expose()
  @Type(() => DeploymentHistory)
  public history: DeploymentHistory;

  public constructor(
    schemaVersion?: number,
    metadata?: RemoteConfigMetadata,
    versions?: ApplicationVersions,
    clusters?: Cluster[],
    state?: DeploymentState,
    history?: DeploymentHistory,
  ) {
    this.schemaVersion = schemaVersion || 0;
    this.metadata = metadata || new RemoteConfigMetadata();
    this.versions = versions || new ApplicationVersions();
    this.clusters = clusters || [];
    this.state = state || new DeploymentState();
    this.history = history || new DeploymentHistory();
  }
}
