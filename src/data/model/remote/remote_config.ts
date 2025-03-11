// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Type} from 'class-transformer';
import {RemoteConfigMetadata} from './remote_config_metadata.js';
import {ApplicationVersions} from '../common/application_versions.js';
import {Cluster} from '../common/cluster.js';

@Exclude()
export class RemoteConfig {
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
}
