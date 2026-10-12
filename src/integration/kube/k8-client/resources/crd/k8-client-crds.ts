// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {type ApiextensionsV1Api, type V1CustomResourceDefinition} from '@kubernetes/client-node';
import {type Crds} from '../../../resources/crd/crds.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';

export class K8ClientCrds implements Crds {
  private readonly logger: SoloLogger;

  public constructor(private readonly networkingApi: ApiextensionsV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async ifExists(crdName: string): Promise<boolean> {
    return (await this.readLabels(crdName)) !== undefined;
  }

  public async readLabels(crdName: string): Promise<Record<string, string> | undefined> {
    try {
      const definition: V1CustomResourceDefinition = await this.networkingApi.readCustomResourceDefinition({
        name: crdName,
      });
      this.logger.debug(`CRD ${crdName} exists.`);
      return definition.metadata?.labels ?? {};
    } catch (error) {
      if (KubeApiResponse.isNotFound(error)) {
        this.logger.info(`CRD ${crdName} does not exist.`);
        return undefined;
      }
      KubeApiResponse.throwError(
        error,
        ResourceOperation.READ,
        ResourceType.CLUSTER_ROLE_DEFINITION,
        undefined,
        crdName,
      );
    }
  }

  public async delete(crdName: string): Promise<void> {
    try {
      await this.networkingApi.deleteCustomResourceDefinition({name: crdName});
      this.logger.debug(`CRD ${crdName} deleted.`);
    } catch (error) {
      if (KubeApiResponse.isNotFound(error)) {
        // Already gone: deleting a CRD that was never created, or was removed by someone else, is a no-op.
        this.logger.info(`CRD ${crdName} does not exist, nothing to delete.`);
        return;
      }
      KubeApiResponse.throwError(
        error,
        ResourceOperation.DELETE,
        ResourceType.CLUSTER_ROLE_DEFINITION,
        undefined,
        crdName,
      );
    }
  }
}
