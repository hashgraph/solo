/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Ingresses} from '../../../resources/ingress/ingresses.js';
import {type NamespaceName} from '../../../resources/namespace/namespace_name.js';
import {SoloLogger} from '../../../../logging.js';
import {type V1IngressList, type NetworkingV1Api, type V1Ingress} from '@kubernetes/client-node';
import {container} from 'tsyringe-neo';
import {type IncomingMessage} from 'http';
import {ResourceReadError, ResourceUpdateError} from '../../../errors/resource_operation_errors.js';
import {ResourceType} from '../../../resources/resource_type.js';
import {KubeApiResponse} from '../../../kube_api_response.js';
import {ResourceOperation} from '../../../resources/resource_operation.js';
import {SoloError} from '../../../../errors.js';

export class K8ClientIngresses implements Ingresses {
  private readonly logger: SoloLogger;

  constructor(private readonly networkingApi: NetworkingV1Api) {
    this.logger = container.resolve(SoloLogger);
  }

  public async listForAllNamespaces(): Promise<string[]> {
    let result: {response: IncomingMessage; body: V1IngressList};
    try {
      result = await this.networkingApi.listIngressForAllNamespaces();
    } catch (e) {
      throw new ResourceReadError(ResourceType.INGRESS, undefined, '', e);
    }

    KubeApiResponse.check(result.response, ResourceOperation.LIST, ResourceType.INGRESS, undefined, '');

    if (!result?.body?.items) {
      return [];
    } else {
      const ingressNames = [];
      result.body.items.forEach(ingress => {
        ingressNames.push(ingress.metadata?.name ?? '');
      });
      return ingressNames;
    }
  }

  public async update(namespace: NamespaceName, name: string, patch: object): Promise<void> {
    let ingresses: string[];
    try {
      ingresses = await this.listForAllNamespaces();
    } catch (e) {
      throw new ResourceReadError(ResourceType.INGRESS, undefined, '', e);
    }

    for (const ingressName of ingresses) {
      let result: {response: any; body?: V1Ingress};
      try {
        result = await this.networkingApi.patchNamespacedIngress(
          ingressName,
          namespace.name,
          patch,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            headers: {'Content-Type': 'application/strategic-merge-patch+json'},
          },
        );

        this.logger.info(`Patched Ingress ${ingressName} in namespace ${namespace}, patch: ${JSON.stringify(patch)}`);
      } catch (e) {
        throw new ResourceUpdateError(ResourceType.INGRESS, namespace, ingressName, e);
      }

      KubeApiResponse.check(result.response, ResourceOperation.UPDATE, ResourceType.INGRESS, namespace, ingressName);

      if (!result?.body) {
        throw new SoloError(
          `Failed to update Ingress ${ingressName} in namespace ${namespace}, received no ingress in response to patch`,
        );
      }
    }
  }
}
