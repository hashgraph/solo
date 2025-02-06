/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Services} from '../services.js';
import {type NamespaceName} from '../namespace_name.js';
import {type CoreV1Api, type V1Service} from '@kubernetes/client-node';
import {K8ClientFilter} from './k8_client_filter.js';
import {Duration} from '../../time/duration.js';

export class K8ClientServices extends K8ClientFilter implements Services {
  constructor(private readonly kubeClient: CoreV1Api) {
    super();
  }

  async list(namespace: NamespaceName, labels?: string[]): Promise<V1Service[]> {
    const labelSelector = labels ? labels.join(',') : undefined;
    const serviceList = await this.kubeClient.listNamespacedService(
      namespace.name,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
    );
    return serviceList.body.items;
  }

  async read(namespace: NamespaceName, name: string): Promise<V1Service> {
    const fieldSelector = `metadata.name=${name}`;
    const resp = await this.kubeClient.listNamespacedService(
      namespace.name,
      undefined,
      undefined,
      undefined,
      fieldSelector,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      Duration.ofMinutes(5).toMillis(),
    );

    return this.filterItem(resp.body.items, {name});
  }
}
