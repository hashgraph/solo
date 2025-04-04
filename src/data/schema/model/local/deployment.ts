// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';
import {type Realm, type Shard} from '../../../../core/config/remote/types.js';

@Exclude()
export class Deployment {
  @Expose()
  public name: string;

  @Expose()
  public namespace: string;

  @Expose()
  public clusters: string[];

  @Expose()
  public realm: Realm;

  @Expose()
  public shard: Shard;

  constructor(name?: string, namespace?: string, clusters?: string[], realm?: Realm, shard?: Shard) {
    this.name = name ?? '';
    this.namespace = namespace ?? '';
    this.clusters = clusters ?? [];
    this.realm = realm ?? 0;
    this.shard = shard ?? 0;
  }
}
