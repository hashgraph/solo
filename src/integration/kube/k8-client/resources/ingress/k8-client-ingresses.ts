// SPDX-License-Identifier: Apache-2.0

import {type Ingresses} from '../../../resources/ingress/ingresses.js';
import {type NamespaceName} from '../../../resources/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type V1IngressList, type NetworkingV1Api, type V1Ingress} from '@kubernetes/client-node';
import {container} from 'tsyringe-neo';
import {type IncomingMessage} from 'node:http';
import {ResourceReadError, ResourceUpdateError} from '../../../errors/resource-operation-errors.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';

export class K8ClientIngresses implements Ingresses {
  private readonly logger: SoloLogger;

  public constructor(private readonly networkingApi: NetworkingV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async listForAllNamespaces(): Promise<string[]> {
    let result: {response: IncomingMessage; body: V1IngressList};
    try {
      result = await this.networkingApi.listIngressForAllNamespaces();
    } catch (error) {
      throw new ResourceReadError(ResourceType.INGRESS, undefined, '', error);
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
    const ingresses = [];
    // find the ingresses that match the specified name
    await this.networkingApi
      .listIngressForAllNamespaces()
      .then(response => {
        response.body.items.forEach(ingress => {
          const currentIngressName = ingress.metadata.name;
          if (currentIngressName.includes(name)) {
            ingresses.push(currentIngressName);
          }
        });
      })
      .catch(error => {
        throw new SoloError(`Error listing Ingresses: ${error}`);
      });

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
      } catch (error) {
        throw new ResourceUpdateError(ResourceType.INGRESS, namespace, ingressName, error);
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
