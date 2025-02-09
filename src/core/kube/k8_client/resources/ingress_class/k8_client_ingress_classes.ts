/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type IngressClasses} from '../../../resources/ingress_class/ingress_classes.js';
import {type IngressClass} from '../../../resources/ingress_class/ingress_class.js';
import {type V1IngressClass, type NetworkingV1Api} from '@kubernetes/client-node';
import {K8ClientIngressClass} from './k8_client_ingress_class.js';
import {SoloError} from '../../../../errors.js';

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
}
