// SPDX-License-Identifier: Apache-2.0

import {type IngressClasses} from '../../../resources/ingress_class/ingress_classes.js';
import {type IngressClass} from '../../../resources/ingress_class/ingress_class.js';
import {type V1IngressClass, type NetworkingV1Api} from '@kubernetes/client-node';
import {K8ClientIngressClass} from './k8_client_ingress_class.js';
import {SoloError} from '../../../../errors.js';
import {ResourceCreateError, ResourceDeleteError} from '../../../errors/resource_operation_errors.js';
import {ResourceType} from '../../../resources/resource_type.js';

export class K8ClientIngressClasses implements IngressClasses {
  constructor(private readonly networkingApi: NetworkingV1Api) {}

  public async list(): Promise<IngressClass[]> {
    try {
      const response = await this.networkingApi.listIngressClass();
      const ingressClasses: IngressClass[] = [];

      if (response?.body?.items?.length > 0) {
        response.body.items.forEach((item: V1IngressClass) =>
          ingressClasses.push(new K8ClientIngressClass(item.metadata?.name)),
        );
      }

      return ingressClasses;
    } catch (e) {
      throw new SoloError('Failed to list IngressClasses:', e);
    }
  }

  public async create(ingressClassName: string, controllerName: string) {
    const ingressClass = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'IngressClass',
      metadata: {
        name: ingressClassName,
      },
      spec: {
        controller: controllerName,
      },
    };
    try {
      await this.networkingApi.createIngressClass(ingressClass);
    } catch (e) {
      throw new ResourceCreateError(ResourceType.INGRESS_CLASS, undefined, ingressClassName, e);
    }
  }

  public async delete(ingressClassName: string) {
    try {
      await this.networkingApi.deleteIngressClass(ingressClassName);
    } catch (e) {
      throw new ResourceDeleteError(ResourceType.INGRESS_CLASS, undefined, ingressClassName, e);
    }
  }
}
