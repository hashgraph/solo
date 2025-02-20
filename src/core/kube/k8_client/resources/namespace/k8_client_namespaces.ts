/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Namespaces} from '../../../resources/namespace/namespaces.js';
import {type V1Status, type CoreV1Api} from '@kubernetes/client-node';
import {StatusCodes} from 'http-status-codes';
import {SoloError} from '../../../../errors.js';
import {NamespaceName} from '../../../resources/namespace/namespace_name.js';
import {ResourceDeleteError} from '../../../errors/resource_operation_errors.js';
import {ResourceType} from '../../../resources/resource_type.js';

export class K8ClientNamespaces implements Namespaces {
  constructor(private readonly kubeClient: CoreV1Api) {}

  public async create(namespace: NamespaceName): Promise<boolean> {
    const payload = {
      metadata: {
        name: namespace.name,
      },
    };

    const resp = await this.kubeClient.createNamespace(payload);
    return resp.response.statusCode === StatusCodes.CREATED;
  }

  public async delete(namespace: NamespaceName): Promise<boolean> {
    try {
      const resp: {response: any; body?: V1Status} = await this.kubeClient.deleteNamespace(namespace.name);
      return resp.response.statusCode === StatusCodes.OK;
    } catch {
      return false;
    }
  }

  public async has(namespace: NamespaceName): Promise<boolean> {
    const namespaces = await this.list();
    return namespaces.some(namespaces => namespaces.equals(namespace));
  }

  public async list(): Promise<NamespaceName[]> {
    const resp = await this.kubeClient.listNamespace();
    if (resp.body && resp.body.items) {
      const namespaces: NamespaceName[] = [];
      resp.body.items.forEach(item => {
        namespaces.push(NamespaceName.of(item.metadata!.name));
      });

      return namespaces;
    }

    throw new SoloError('incorrect response received from kubernetes API. Unable to list namespaces');
  }
}
