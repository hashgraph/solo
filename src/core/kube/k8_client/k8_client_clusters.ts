/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Clusters} from '../clusters.js';
import {type KubeConfig} from '@kubernetes/client-node';
import {IllegalArgumentError} from '../../errors.js';

export default class K8ClientClusters implements Clusters {
  public constructor(private readonly kubeConfig: KubeConfig) {
    if (!kubeConfig) {
      throw new IllegalArgumentError('kubeConfig must not be null or undefined');
    }
  }

  public list(): string[] {
    const clusters: string[] = [];
    for (const cluster of this.kubeConfig.getClusters()) {
      clusters.push(cluster.name);
    }

    return clusters;
  }

  public readCurrent(): string {
    const currentCluster = this.kubeConfig.getCurrentCluster();
    return !currentCluster ? '' : currentCluster.name;
  }
}
