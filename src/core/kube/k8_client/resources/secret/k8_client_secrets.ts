/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Secrets} from '../../../resources/secret/secrets.js';
import {type CoreV1Api, V1ObjectMeta, V1Secret} from '@kubernetes/client-node';
import {type NamespaceName} from '../../../resources/namespace/namespace_name.js';
import {type Optional} from '../../../../../types/index.js';
import {KubeApiResponse} from '../../../kube_api_response.js';
import {
  ResourceCreateError,
  ResourceNotFoundError,
  ResourceReplaceError,
} from '../../../errors/resource_operation_errors.js';
import {ResourceType} from '../../../resources/resource_type.js';
import {ResourceOperation} from '../../../resources/resource_operation.js';
import {Duration} from '../../../../time/duration.js';
import {type SecretType} from '../../../resources/secret/secret_type.js';

export class K8ClientSecrets implements Secrets {
  public constructor(private readonly kubeClient: CoreV1Api) {}

  public async create(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean> {
    return await this.createOrReplaceWithForce(namespace, name, secretType, data, labels, false, true);
  }

  public async createOrReplace(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean> {
    return await this.createOrReplaceWithForce(namespace, name, secretType, data, labels, false, false);
  }

  public async delete(namespace: NamespaceName, name: string): Promise<boolean> {
    const resp = await this.kubeClient.deleteNamespacedSecret(name, namespace.name);
    return !KubeApiResponse.isFailingStatus(resp.response);
  }

  public async replace(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean> {
    return this.createOrReplaceWithForce(namespace, name, secretType, data, labels, true, false);
  }

  public async read(
    namespace: NamespaceName,
    name: string,
  ): Promise<{
    data: Record<string, string>;
    name: string;
    namespace: string;
    type: string;
    labels: Record<string, string>;
  }> {
    const {response, body} = await this.kubeClient.readNamespacedSecret(name, namespace.name).catch(e => e);
    KubeApiResponse.check(response, ResourceOperation.READ, ResourceType.SECRET, namespace, name);
    return {
      name: body.metadata!.name as string,
      labels: body.metadata!.labels as Record<string, string>,
      namespace: body.metadata!.namespace as string,
      type: body.type as string,
      data: body.data as Record<string, string>,
    };
  }

  public async list(
    namespace: NamespaceName,
    labels?: string[],
  ): Promise<
    Array<{
      data: Record<string, string>;
      name: string;
      namespace: string;
      type: string;
      labels: Record<string, string>;
    }>
  > {
    const labelSelector: string = labels ? labels.join(',') : undefined;
    const secretList = await this.kubeClient.listNamespacedSecret(
      namespace.toString(),
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
      undefined,
      undefined,
      undefined,
      undefined,
      Duration.ofMinutes(5).toMillis(),
    );
    KubeApiResponse.check(secretList.response, ResourceOperation.LIST, ResourceType.SECRET, namespace, '');
    return secretList.body.items.map((secret: V1Secret) => {
      return {
        name: secret.metadata!.name as string,
        labels: secret.metadata!.labels as Record<string, string>,
        namespace: secret.metadata!.namespace as string,
        type: secret.type as string,
        data: secret.data as Record<string, string>,
      };
    });
  }

  public async exists(namespace: NamespaceName, name: string): Promise<boolean> {
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
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
    forceReplace?: boolean,
    forceCreate?: boolean,
  ): Promise<boolean> {
    const replace = await this.shouldReplace(namespace, name, forceReplace, forceCreate);
    const v1Secret = new V1Secret();
    v1Secret.apiVersion = 'v1';
    v1Secret.kind = 'Secret';
    v1Secret.type = secretType;
    v1Secret.data = data;
    v1Secret.metadata = new V1ObjectMeta();
    v1Secret.metadata.name = name;
    v1Secret.metadata.labels = labels;

    try {
      const resp = replace
        ? await this.kubeClient.replaceNamespacedSecret(name, namespace.name, v1Secret)
        : await this.kubeClient.createNamespacedSecret(namespace.name, v1Secret);
      return !KubeApiResponse.isFailingStatus(resp.response);
    } catch (e) {
      if (replace) {
        throw new ResourceReplaceError(ResourceType.SECRET, namespace, name, e);
      } else {
        throw new ResourceCreateError(ResourceType.SECRET, namespace, name, e);
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
}
