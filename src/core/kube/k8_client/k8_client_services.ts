/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Services} from '../services.js';
import {type NamespaceName} from '../namespace_name.js';
import {type CoreV1Api, type V1Service} from '@kubernetes/client-node';
import {K8ClientBase} from './k8_client_base.js';
import {type Service} from '../service.js';
import {KubeApiResponse} from '../kube_api_response.js';
import {ResourceOperation} from '../resource_operation.js';
import {ResourceType} from '../resource_type.js';
import {K8ClientService} from './k8_client_service.js';
import {type ServiceSpec} from '../service_spec.js';
import {type ServiceStatus} from '../service_status.js';

export class K8ClientServices extends K8ClientBase implements Services {
  public constructor(private readonly kubeClient: CoreV1Api) {
    super();
  }

  public async list(namespace: NamespaceName, labels?: string[]): Promise<Service[]> {
    const labelSelector = labels ? labels.join(',') : undefined;
    const serviceList = await this.kubeClient.listNamespacedService(
      namespace.name,
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
    );
    KubeApiResponse.check(serviceList.response, ResourceOperation.LIST, ResourceType.SERVICE, namespace, '');
    return serviceList.body.items.map((svc: V1Service) => {
      return this.wrapService(namespace, svc);
    });
  }

  public async read(namespace: NamespaceName, name: string): Promise<Service> {
    const svc = await this.readV1Service(namespace, name);

    if (!svc) {
      return null;
    }

    return this.wrapService(namespace, svc);
  }

  private async readV1Service(namespace: NamespaceName, name: string): Promise<V1Service> {
    const {response, body} = await this.kubeClient.readNamespacedService(name, namespace.name);
    KubeApiResponse.check(response, ResourceOperation.READ, ResourceType.SERVICE, namespace, name);
    return body as V1Service;
  }

  private wrapService(namespace: NamespaceName, svc: V1Service): Service {
    return new K8ClientService(this.wrapObjectMeta(svc.metadata), svc.spec as ServiceSpec, svc.status as ServiceStatus);
  }
}
