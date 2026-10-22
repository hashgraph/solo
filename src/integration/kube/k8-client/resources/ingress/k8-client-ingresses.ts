// SPDX-License-Identifier: Apache-2.0

import {type Ingresses} from '../../../resources/ingress/ingresses.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {
  PatchStrategy,
  setHeaderOptions,
  type NetworkingV1Api,
  type V1Ingress,
  type V1IngressList,
} from '@kubernetes/client-node';
import {container} from 'tsyringe-neo';
import {ResourceType} from '../../../resources/resource-type.js';
import {KubeApiInvalidResponseError} from '../../../errors/kube-api-invalid-response-error.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';

export class K8ClientIngresses implements Ingresses {
  private readonly logger: SoloLogger;

  public constructor(private readonly networkingApi: NetworkingV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async listForAllNamespaces(): Promise<string[]> {
    let result: V1IngressList;
    try {
      result = await this.networkingApi.listIngressForAllNamespaces();
    } catch (error) {
      if (KubeApiResponse.isNotFound(error)) {
        return [];
      }
      KubeApiResponse.throwError(error, ResourceOperation.LIST, ResourceType.INGRESS, undefined, '');
    }

    if (result?.items) {
      const ingressNames: string[] = [];
      for (const ingress of result.items) {
        ingressNames.push(ingress.metadata?.name ?? '');
      }
      return ingressNames;
    } else {
      return [];
    }
  }

  public async update(namespace: NamespaceName, name: string, patch: object): Promise<void> {
    const ingresses: string[] = [];
    try {
      const result: V1IngressList = await this.networkingApi.listNamespacedIngress({namespace: namespace.name});
      for (const ingress of result.items) {
        const currentIngressName: string = ingress.metadata.name;
        // an Ingress belongs to the release when its name is the release name or is prefixed by it
        if (currentIngressName === name || currentIngressName.startsWith(`${name}-`)) {
          ingresses.push(currentIngressName);
        }
      }
    } catch (error) {
      if (!KubeApiResponse.isNotFound(error)) {
        KubeApiResponse.throwError(error, ResourceOperation.UPDATE, ResourceType.INGRESS, namespace, name);
      }
    }

    for (const ingressName of ingresses) {
      let result: V1Ingress;
      try {
        result = await this.networkingApi.patchNamespacedIngress(
          {
            name: ingressName,
            namespace: namespace.name,
            body: patch,
          },
          setHeaderOptions('Content-Type', PatchStrategy.MergePatch),
        );

        this.logger.info(`Patched Ingress ${ingressName} in namespace ${namespace}, patch: ${JSON.stringify(patch)}`);
      } catch (error) {
        KubeApiResponse.throwError(error, ResourceOperation.UPDATE, ResourceType.INGRESS, namespace, ingressName);
      }

      if (!result) {
        throw new KubeApiInvalidResponseError();
      }
    }
  }
}
