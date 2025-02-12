/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ToObject} from '../../../types/index.js';
import {type ClusterRef, type ICluster, type NamespaceNameAsString} from './types.js';
import {SoloError} from '../../errors.js';

export class Cluster implements ICluster, ToObject<ICluster> {
  private readonly _name: string;
  private readonly _namespace: string;
  private readonly _dnsBaseDomain: string = 'cluster.local'; // example: 'us-west-2.gcp.charlie.sphere'`
  private readonly _dnsConsensusNodePattern: string = 'network-${nodeAlias}-svc.${namespace}.svc'; // example: '${nodeId}.consensus.prod'`

  public constructor(
    name: string,
    namespace: NamespaceNameAsString,
    dnsBaseDomain?: string,
    dnsConsensusNodePattern?: string,
  ) {
    if (!name) {
      throw new SoloError('name is required');
    }

    if (typeof name !== 'string') {
      throw new SoloError(`Invalid type for name: ${typeof name}`);
    }

    if (!namespace) {
      throw new SoloError('namespace is required');
    }

    if (typeof namespace !== 'string') {
      throw new SoloError(`Invalid type for namespace: ${typeof namespace}`);
    }

    this._name = name;
    this._namespace = namespace;

    if (dnsBaseDomain) {
      this._dnsBaseDomain = dnsBaseDomain;
    }

    if (dnsConsensusNodePattern) {
      this._dnsConsensusNodePattern = dnsConsensusNodePattern;
    }
  }

  public get name(): string {
    return this._name;
  }

  public get namespace(): string {
    return this._namespace;
  }

  public get dnsBaseDomain(): string {
    return this._dnsBaseDomain;
  }

  public get dnsConsensusNodePattern(): string {
    return this._dnsConsensusNodePattern;
  }

  public toObject(): ICluster {
    return {
      name: this.name,
      namespace: this.namespace,
      dnsBaseDomain: this.dnsBaseDomain,
      dnsConsensusNodePattern: this.dnsConsensusNodePattern,
    };
  }

  public static fromObject(cluster: ICluster) {
    return new Cluster(cluster.name, cluster.namespace, cluster.dnsBaseDomain, cluster.dnsConsensusNodePattern);
  }

  public static toClustersMapObject(clustersMap: Record<ClusterRef, Cluster>) {
    const entries = Object.entries(clustersMap).map(([ref, cluster]) => [ref, cluster.toObject()]);
    return Object.fromEntries(entries);
  }

  public static fromClustersMapObject(obj: any): Record<ClusterRef, Cluster> {
    const clusters: Record<ClusterRef, Cluster> = {};

    for (const [ref, cluster] of Object.entries(obj)) {
      clusters[ref] = Cluster.fromObject(cluster as ICluster);
    }

    return clusters;
  }
}
