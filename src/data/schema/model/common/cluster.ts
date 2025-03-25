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

  public constructor(
    name?: string,
    namespace?: string,
    deployment?: string,
    dnsBaseDomain?: string,
    dnsConsensusNodePattern?: string,
  ) {
    this.name = name ?? '';
    this.namespace = namespace ?? '';
    this.deployment = deployment ?? '';
    this.dnsBaseDomain = dnsBaseDomain ?? 'cluster.local';
    this.dnsConsensusNodePattern = dnsConsensusNodePattern ?? 'network-${nodeAlias}-svc.${namespace}.svc';
  }
}
