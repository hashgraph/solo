// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

@Exclude()
export class Deployment {
  @Expose()
  public name: string;

  @Expose()
  public namespace: string;

  @Expose()
  public clusters: string[];

  constructor(name?: string, namespace?: string, clusters?: string[]) {
    this.name = name || '';
    this.namespace = namespace || '';
    this.clusters = clusters || [];
  }
}
