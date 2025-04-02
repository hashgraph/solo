// SPDX-License-Identifier: Apache-2.0

import {type CoreV1Api, V1ConfigMap, V1ObjectMeta} from '@kubernetes/client-node';
import {type ConfigMaps} from '../../../resources/config-map/config-maps.js';
import {type NamespaceName} from '../../../resources/namespace/namespace-name.js';
import {
  ResourceCreateError,
  ResourceDeleteError,
  ResourceNotFoundError,
  ResourceReplaceError,
  ResourceUpdateError,
} from '../../../errors/resource-operation-errors.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import {container} from 'tsyringe-neo';
import {type ConfigMap} from '../../../resources/config-map/config-map.js';
import {K8ClientConfigMap} from './k8-client-config-map.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';

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
      const resp = await this.kubeClient.deleteNamespacedConfigMap(name, namespace.name);
      return KubeApiResponse.isFailingStatus(resp.response);
    } catch (error) {
      throw new ResourceDeleteError(ResourceType.CONFIG_MAP, namespace, name, error);
    }
  }

  public async read(namespace: NamespaceName, name: string): Promise<ConfigMap> {
    const {response, body} = await this.kubeClient.readNamespacedConfigMap(name, namespace.name).catch(error => error);
    KubeApiResponse.check(response, ResourceOperation.READ, ResourceType.CONFIG_MAP, namespace, name);
    return K8ClientConfigMap.fromV1ConfigMap(body);
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
      const resp = replace
        ? await this.kubeClient.replaceNamespacedConfigMap(name, namespace.name, configMap)
        : await this.kubeClient.createNamespacedConfigMap(namespace.name, configMap);
      return KubeApiResponse.isCreatedStatus(resp.response);
    } catch (error) {
      if (replace) {
        throw new ResourceReplaceError(ResourceType.CONFIG_MAP, namespace, name, error);
      } else {
        throw new ResourceCreateError(ResourceType.CONFIG_MAP, namespace, name, error);
      }
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
    const labelsSelector: string = labels ? labels.join(',') : undefined;

    let results: {response: any; body: any};
    try {
      results = await this.kubeClient.listNamespacedConfigMap(
        namespace.name,
        undefined,
        undefined,
        undefined,
        undefined,
        labelsSelector,
      );
    } catch (error) {
      throw new SoloError('Failed to list config maps', error);
    }

    KubeApiResponse.check(results.response, ResourceOperation.LIST, ResourceType.CONFIG_MAP, namespace, '');
    return (
      results?.body?.items?.map((v1ConfigMap: V1ConfigMap) => K8ClientConfigMap.fromV1ConfigMap(v1ConfigMap)) || []
    );
  }

  public async listForAllNamespaces(labels: string[]): Promise<ConfigMap[]> {
    const labelsSelector: string = labels ? labels.join(',') : undefined;

    let results: {response: any; body: any};
    try {
      results = await this.kubeClient.listConfigMapForAllNamespaces(undefined, undefined, undefined, labelsSelector);
    } catch (error) {
      throw new SoloError('Failed to list config maps for all namespaces', error);
    }

    KubeApiResponse.check(results.response, ResourceOperation.LIST, ResourceType.CONFIG_MAP, undefined, '');
    return (
      results?.body?.items?.map((v1ConfigMap: V1ConfigMap) => K8ClientConfigMap.fromV1ConfigMap(v1ConfigMap)) || []
    );
  }

  public async update(namespace: NamespaceName, name: string, data: Record<string, string>): Promise<void> {
    if (!(await this.exists(namespace, name))) {
      throw new ResourceNotFoundError(ResourceOperation.READ, ResourceType.CONFIG_MAP, namespace, name);
    }

    const patch: {data: Record<string, string>} = {
      data: data,
    };

    const options: {headers: {[name: string]: string} | {'Content-Type': string}} = {
      headers: {'Content-Type': 'application/merge-patch+json'}, // Or the appropriate content type
    };

    let result: {response: any; body?: V1ConfigMap};
    try {
      result = await this.kubeClient.patchNamespacedConfigMap(
        name,
        namespace.name,
        patch,
        undefined, // pretty
        undefined, // dryRun
        undefined, // fieldManager
        undefined, // fieldValidation
        undefined, // force
        options, // Pass the options here
      );
      this.logger.info(`Patched ConfigMap ${name} in namespace ${namespace}`);
    } catch (error) {
      throw new ResourceUpdateError(ResourceType.CONFIG_MAP, namespace, name, error);
    }

    KubeApiResponse.check(result.response, ResourceOperation.UPDATE, ResourceType.CONFIG_MAP, namespace, name);

    if (result.body) {
      return;
    } else {
      throw new SoloError(
        `Failed to patch ConfigMap ${name} in namespace ${namespace}, no config map returned from patch`,
      );
    }
  }
}
