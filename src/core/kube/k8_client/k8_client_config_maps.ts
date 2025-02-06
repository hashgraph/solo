/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as k8s from '@kubernetes/client-node';
import {type V1ConfigMap} from '@kubernetes/client-node';
import {type ConfigMaps} from '../config_maps.js';
import {type NamespaceName} from '../namespace_name.js';
import {
  ResourceCreateError,
  ResourceDeleteError,
  ResourceNotFoundError,
  ResourceReplaceError,
} from '../errors/resource_operation_errors.js';
import {ResourceType} from '../resource_type.js';
import {ResourceOperation} from '../resource_operation.js';
import {KubeApiResponse} from '../kube_api_response.js';

export default class K8ClientConfigMaps implements ConfigMaps {
  constructor(private readonly kubeClient: k8s.CoreV1Api) {}

  async create(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    return this.createOrReplaceWithForce(namespace, name, labels, data, false, true);
  }

  async createOrReplace(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    return this.createOrReplaceWithForce(namespace, name, labels, data, false, false);
  }

  async delete(namespace: NamespaceName, name: string): Promise<boolean> {
    try {
      const resp = await this.kubeClient.deleteNamespacedConfigMap(name, namespace.name);
      return KubeApiResponse.isFailingStatus(resp.response);
    } catch (e) {
      throw new ResourceDeleteError(ResourceType.CONFIG_MAP, namespace, name, e);
    }
  }

  async read(namespace: NamespaceName, name: string): Promise<V1ConfigMap> {
    const {response, body} = await this.kubeClient.readNamespacedConfigMap(name, namespace.name).catch(e => e);
    KubeApiResponse.check(response, ResourceOperation.READ, ResourceType.CONFIG_MAP, namespace, name);
    return body as k8s.V1ConfigMap;
  }

  async replace(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean> {
    return this.createOrReplaceWithForce(namespace, name, labels, data, true, false);
  }

  async exists(namespace: NamespaceName, name: string): Promise<boolean> {
    try {
      const cm = await this.read(namespace, name);
      return !!cm;
    } catch (e) {
      if (e instanceof ResourceNotFoundError) {
        return false;
      } else {
        throw e;
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
    const replace = await this.shouldReplace(namespace, name, forceReplace, forceCreate);
    const configMap = new k8s.V1ConfigMap();
    configMap.data = data;

    const metadata = new k8s.V1ObjectMeta();
    metadata.name = name;
    metadata.namespace = namespace.name;
    metadata.labels = labels;
    configMap.metadata = metadata;
    try {
      const resp = replace
        ? await this.kubeClient.replaceNamespacedConfigMap(name, namespace.name, configMap)
        : await this.kubeClient.createNamespacedConfigMap(namespace.name, configMap);
      return KubeApiResponse.isFailingStatus(resp.response);
    } catch (e) {
      if (replace) {
        throw new ResourceReplaceError(ResourceType.CONFIG_MAP, namespace, name, e);
      } else {
        throw new ResourceCreateError(ResourceType.CONFIG_MAP, namespace, name, e);
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

    return this.exists(namespace, name);
  }
}
