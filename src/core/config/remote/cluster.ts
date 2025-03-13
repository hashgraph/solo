// SPDX-License-Identifier: Apache-2.0

import {type ToObject} from '../../../types/index.js';
import {type ClusterRef, type DeploymentName, type ICluster, type NamespaceNameAsString} from './types.js';
import {SoloError} from '../../errors/SoloError.js';

export class Cluster implements ICluster, ToObject<ICluster> {
  public constructor(
    public readonly name: string,
    public readonly namespace: NamespaceNameAsString,
    public readonly deployment: DeploymentName,
    public readonly dnsBaseDomain: string = 'cluster.local', // example: 'us-west-2.gcp.charlie.sphere'`
    public readonly dnsConsensusNodePattern: string = 'network-{nodeAlias}-svc.{namespace}.svc', // example: '{nodeId}.consensus.prod'`
  ) {
    if (!name) throw new SoloError('name is required');
    if (typeof name !== 'string') throw new SoloError(`Invalid type for name: ${typeof name}`);

    if (!namespace) throw new SoloError('namespace is required');
    if (typeof namespace !== 'string') throw new SoloError(`Invalid type for namespace: ${typeof namespace}`);

    if (!deployment) throw new SoloError('deployment is required');
    if (typeof deployment !== 'string') throw new SoloError(`Invalid type for deployment: ${typeof deployment}`);
  }

  public toObject(): ICluster {
    return {
      name: this.name,
      namespace: this.namespace,
      deployment: this.deployment,
      dnsBaseDomain: this.dnsBaseDomain,
      dnsConsensusNodePattern: this.dnsConsensusNodePattern,
    };
  }

  public static fromObject(cluster: ICluster) {
    return new Cluster(
      cluster.name,
      cluster.namespace,
      cluster.deployment,
      cluster.dnsBaseDomain,
      cluster.dnsConsensusNodePattern,
    );
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
