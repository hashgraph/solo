// SPDX-License-Identifier: Apache-2.0

import {type ToObject} from '../../../types/index.js';
import {type ClusterReference, type DeploymentName, type ICluster, type NamespaceNameAsString} from './types.js';
import {SoloError} from '../../errors/solo-error.js';

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

  public static toClustersMapObject(clustersMap: Record<ClusterReference, Cluster>) {
    const entries = Object.entries(clustersMap).map(([reference, cluster]) => [reference, cluster.toObject()]);
    return Object.fromEntries(entries);
  }

  public static fromClustersMapObject(object: any): Record<ClusterReference, Cluster> {
    const clusters: Record<ClusterReference, Cluster> = {};

    for (const [reference, cluster] of Object.entries(object)) {
      clusters[reference] = Cluster.fromObject(cluster as ICluster);
    }

    return clusters;
  }
}
