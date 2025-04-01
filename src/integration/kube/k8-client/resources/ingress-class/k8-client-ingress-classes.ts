// SPDX-License-Identifier: Apache-2.0

import {type IngressClasses} from '../../../resources/ingress-class/ingress-classes.js';
import {type IngressClass} from '../../../resources/ingress-class/ingress-class.js';
import {type V1IngressClass, type NetworkingV1Api} from '@kubernetes/client-node';
import {K8ClientIngressClass} from './k8-client-ingress-class.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {ResourceCreateError, ResourceDeleteError} from '../../../errors/resource-operation-errors.js';
import {ResourceType} from '../../../resources/resource-type.js';

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
    } catch (error) {
      throw new SoloError('Failed to list IngressClasses:', error);
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
    } catch (error) {
      throw new ResourceCreateError(ResourceType.INGRESS_CLASS, undefined, ingressClassName, error);
    }
  }

  public async delete(ingressClassName: string) {
    try {
      await this.networkingApi.deleteIngressClass(ingressClassName);
    } catch (error) {
      throw new ResourceDeleteError(ResourceType.INGRESS_CLASS, undefined, ingressClassName, error);
    }
  }
}
