/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Pvcs} from '../pvcs.js';
import {type NamespaceName} from '../namespace_name.js';
import {StatusCodes} from 'http-status-codes';
import {type CoreV1Api} from '@kubernetes/client-node';
import {Duration} from '../../time/duration.js';

export class K8ClientPvcs implements Pvcs {
  constructor(private readonly kubeClient: CoreV1Api) {}

  public async delete(namespace: NamespaceName, name: string): Promise<boolean> {
    const resp = await this.kubeClient.deleteNamespacedPersistentVolumeClaim(name, namespace.name);

    return resp.response.statusCode === StatusCodes.OK;
  }

  public async list(namespace: NamespaceName, labels: string[]): Promise<string[]> {
    const pvcs: string[] = [];
    const labelSelector = labels.join(',');
    const resp = await this.kubeClient.listNamespacedPersistentVolumeClaim(
      namespace.name,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
      undefined,
      undefined,
      undefined,
      undefined,
      Duration.ofMinutes(5).toMillis(),
    );

    for (const item of resp.body.items) {
      pvcs.push(item.metadata!.name as string);
    }

    return pvcs;
  }
}
