// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

@Exclude()
export class Cluster {
  @Expose()
  public name: string;

  @Expose()
  public namespace: string;

  @Expose()
  public deployment: string;

  @Expose()
  public dnsBaseDomain: string;

  @Expose()
  public dnsConsensusNodePattern: string;
}
