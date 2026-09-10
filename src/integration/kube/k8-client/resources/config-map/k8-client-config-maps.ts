// SPDX-License-Identifier: Apache-2.0

import {
  type CoreV1Api,
  PatchStrategy,
  setHeaderOptions,
  V1ConfigMap,
  type V1ConfigMapList,
  V1ObjectMeta,
} from '@kubernetes/client-node';
import {type ConfigMaps} from '../../../resources/config-map/config-maps.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {ResourceNotFoundError} from '../../../errors/resource-operation-errors.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {KubeApiInvalidResponseError} from '../../../errors/kube-api-invalid-response-error.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {container} from 'tsyringe-neo';
import {type ConfigMap} from '../../../resources/config-map/config-map.js';
import {K8ClientConfigMap} from './k8-client-config-map.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {sleep} from '../../../../../core/helpers.js';
import {Duration} from '../../../../../core/time/duration.js';

export class K8ClientConfigMaps implements ConfigMaps {
  private readonly logger: SoloLogger;

  public constructor(private readonly kubeClient: CoreV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async create(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    return await this.createOrReplaceWithForce(namespace, name, labels, data, false, true);
  }

  public async createOrReplace(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    return await this.createOrReplaceWithForce(namespace, name, labels, data, false, false);
  }

  public async delete(namespace: NamespaceName, name: string): Promise<boolean> {
    try {
      await this.kubeClient.deleteNamespacedConfigMap({
        name,
        namespace: namespace.name,
      });
      return true;
    } catch (error) {
      return KubeApiResponse.isFailingStatus(error);
    }
  }

  public async read(namespace: NamespaceName, name: string): Promise<ConfigMap> {
    try {
      const body: V1ConfigMap = await this.kubeClient.readNamespacedConfigMap({name, namespace: namespace?.name});
      return K8ClientConfigMap.fromV1ConfigMap(body);
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.READ, ResourceType.CONFIG_MAP, namespace, name);
    }
  }

  public async replace(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    return await this.createOrReplaceWithForce(namespace, name, labels, data, true, false);
  }

  public async exists(namespace: NamespaceName, name: string): Promise<boolean> {
    try {
      const cm: ConfigMap = await this.read(namespace, name);
      return !!cm;
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        return false;
      } else {
        throw error;
      }
    }
  }

  private async createOrReplaceWithForce(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
    forceReplace?: boolean,
    forceCreate?: boolean,
  ): Promise<boolean> {
    const replace: boolean = await this.shouldReplace(namespace, name, forceReplace, forceCreate);
    const configMap: V1ConfigMap = new V1ConfigMap();
    configMap.data = data;

    const metadata: V1ObjectMeta = new V1ObjectMeta();
    metadata.name = name;
    metadata.namespace = namespace.name;
    metadata.labels = labels;
    configMap.metadata = metadata;
    try {
      await (replace
        ? this.kubeClient.replaceNamespacedConfigMap({name, namespace: namespace.name, body: configMap})
        : this.kubeClient.createNamespacedConfigMap({namespace: namespace.name, body: configMap}));
      return true;
    } catch (error) {
      KubeApiResponse.throwError(
        error,
        replace ? ResourceOperation.REPLACE : ResourceOperation.CREATE,
        ResourceType.CONFIG_MAP,
        namespace,
        name,
      );
    }
  }

  private async shouldReplace(
    namespace: NamespaceName,
    name: string,
    forceReplace?: boolean,
    forceCreate?: boolean,
  ): Promise<boolean> {
    if (forceReplace && !forceCreate) {
      return true;
    }

    if (forceCreate) {
      return false;
    }

    return await this.exists(namespace, name);
  }

  public async list(namespace: NamespaceName, labels: string[]): Promise<ConfigMap[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;

    let results: V1ConfigMapList;
    try {
      results = await this.kubeClient.listNamespacedConfigMap({
        namespace: namespace.name,
        labelSelector,
      });
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.LIST, ResourceType.CONFIG_MAP, namespace, '');
    }

    return results?.items?.map((v1ConfigMap): ConfigMap => K8ClientConfigMap.fromV1ConfigMap(v1ConfigMap)) || [];
  }

  public async listForAllNamespaces(labels: string[]): Promise<ConfigMap[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;

    let results: V1ConfigMapList;
    try {
      results = await this.kubeClient.listConfigMapForAllNamespaces({labelSelector});
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.LIST, ResourceType.CONFIG_MAP, undefined, '');
    }

    return results?.items?.map((v1ConfigMap): ConfigMap => K8ClientConfigMap.fromV1ConfigMap(v1ConfigMap)) || [];
  }

  public async update(
    namespace: NamespaceName,
    name: string,
    data: Record<string, string>,
    maxAttempts: number = 5,
    delay: number = 2000,
  ): Promise<void> {
    if (!(await this.exists(namespace, name))) {
      throw new ResourceNotFoundError(ResourceOperation.READ, ResourceType.CONFIG_MAP, namespace, name);
    }

    const patch: {data: Record<string, string>} = {
      data: data,
    };

    let result: V1ConfigMap;
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await this.kubeClient.patchNamespacedConfigMap(
          {
            name,
            namespace: namespace.name,
            body: patch,
            // Helm v4 uses SSA with fieldManager="helm". Setting the same manager here
            // prevents "conflict with node-fetch" errors when helm upgrade re-applies
            // ConfigMaps that Solo has written to via merge-patch.
            fieldManager: 'helm',
          },
          setHeaderOptions('Content-Type', PatchStrategy.MergePatch),
        );
        this.logger.info(`Patched ConfigMap ${name} in namespace ${namespace}`);
        break;
      } catch (error) {
        // merge-patch is idempotent, so transient API server failures (e.g. etcd request
        // timeouts surfacing as HTTP 500 on resource-constrained clusters) are safe to retry
        if (attempt < maxAttempts && KubeApiResponse.isTransientServerError(error)) {
          this.logger.warn(
            `transient error patching ConfigMap ${name} in namespace ${namespace}, ` +
              `attempt ${attempt}/${maxAttempts}, retrying`,
          );
          await sleep(Duration.ofMillis(delay));
          continue;
        }
        KubeApiResponse.throwError(error, ResourceOperation.UPDATE, ResourceType.CONFIG_MAP, namespace, name);
      }
    }

    if (result) {
      return;
    } else {
      throw new KubeApiInvalidResponseError();
    }
  }
}
