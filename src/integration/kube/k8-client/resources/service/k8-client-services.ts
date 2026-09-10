// SPDX-License-Identifier: Apache-2.0

import {type Services} from '../../../resources/service/services.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {
  type CoreV1Api,
  V1ObjectMeta,
  V1Service,
  type V1ServiceList,
  V1ServicePort,
  V1ServiceSpec,
} from '@kubernetes/client-node';
import {K8ClientBase} from '../../k8-client-base.js';
import {type Service} from '../../../resources/service/service.js';
import {K8ClientService} from './k8-client-service.js';
import {type ServiceSpec} from '../../../resources/service/service-spec.js';
import {type ServiceStatus} from '../../../resources/service/service-status.js';
import {type ServiceReference} from '../../../resources/service/service-reference.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {KubeServiceLoadBalancerTimeoutError} from '../../../errors/kube-service-load-balancer-timeout-error.js';
import {type LoadBalancerIngress} from '../../../resources/load-balancer-ingress.js';
import {Duration} from '../../../../../core/time/duration.js';
import {sleep} from '../../../../../core/helpers.js';

export class K8ClientServices extends K8ClientBase implements Services {
  public constructor(private readonly kubeClient: CoreV1Api) {
    super();
  }

  public async list(namespace: NamespaceName, labels?: string[]): Promise<Service[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;
    let serviceList: V1ServiceList;
    try {
      serviceList = await this.kubeClient.listNamespacedService({
        namespace: namespace.name,
        labelSelector,
      });
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.LIST, ResourceType.SERVICE, namespace, '');
    }
    return serviceList.items.map((svc: V1Service): Service => {
      return this.wrapService(namespace, svc);
    });
  }

  public async waitForLoadBalancerAddress(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
  ): Promise<Service[]> {
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      const services: Service[] = await this.list(namespace, labels);
      const loadBalancerServices: Service[] = services.filter(
        (service: Service): boolean => service.spec?.type === 'LoadBalancer',
      );

      if (
        loadBalancerServices.length > 0 &&
        loadBalancerServices.every((service: Service): boolean => K8ClientServices.hasLoadBalancerAddress(service))
      ) {
        return loadBalancerServices;
      }

      if (attempt < maxAttempts) {
        await sleep(Duration.ofMillis(delay));
      }
    }

    throw new KubeServiceLoadBalancerTimeoutError(namespace.name, labels);
  }

  private static hasLoadBalancerAddress(service: Service): boolean {
    const ingresses: LoadBalancerIngress[] = service.status?.loadBalancer?.ingress ?? [];

    return (
      ingresses.length > 0 &&
      ingresses.every((ingress: LoadBalancerIngress): boolean => Boolean(ingress.ip || ingress.hostname))
    );
  }

  public async read(namespace: NamespaceName, name: string): Promise<Service> {
    const svc: V1Service = await this.readV1Service(namespace, name);

    if (!svc) {
      return undefined;
    }

    return this.wrapService(namespace, svc);
  }

  private async readV1Service(namespace: NamespaceName, name: string): Promise<V1Service> {
    let service: V1Service;
    try {
      service = await this.kubeClient.readNamespacedService({name, namespace: namespace.name});
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.READ, ResourceType.SERVICE, namespace, name);
    }
    return service;
  }

  private wrapService(_namespace: NamespaceName, svc: V1Service): Service {
    return new K8ClientService(this.wrapObjectMeta(svc.metadata), svc.spec as ServiceSpec, svc.status as ServiceStatus);
  }

  public async create(
    serviceReference: ServiceReference,
    labels: Record<string, string>,
    servicePort: number,
    podTargetPort: number,
    selector?: Record<string, string>,
    nodePort?: number,
  ): Promise<Service> {
    const v1SvcMetadata: V1ObjectMeta = new V1ObjectMeta();
    v1SvcMetadata.name = serviceReference.name.toString();
    v1SvcMetadata.namespace = serviceReference.namespace.toString();
    v1SvcMetadata.labels = labels;

    const v1SvcPort: V1ServicePort = new V1ServicePort();
    v1SvcPort.port = servicePort;
    v1SvcPort.targetPort = podTargetPort;
    if (nodePort) {
      v1SvcPort.nodePort = nodePort;
    }

    const v1SvcSpec: V1ServiceSpec = new V1ServiceSpec();
    v1SvcSpec.ports = [v1SvcPort];
    if (selector) {
      v1SvcSpec.selector = selector;
    }
    if (nodePort) {
      v1SvcSpec.type = 'NodePort';
    }

    const v1Svc: V1Service = new V1Service();
    v1Svc.metadata = v1SvcMetadata;
    v1Svc.spec = v1SvcSpec;

    let result: V1Service;
    try {
      result = await this.kubeClient.createNamespacedService({
        namespace: serviceReference.namespace.toString(),
        body: v1Svc,
      });
    } catch (error) {
      KubeApiResponse.throwError(
        error,
        ResourceOperation.CREATE,
        ResourceType.SERVICE,
        serviceReference.namespace,
        serviceReference.name.toString(),
      );
    }

    return this.wrapService(serviceReference.namespace, result);
  }
}
