// SPDX-License-Identifier: Apache-2.0

import {type Rbacs} from '../../../resources/rbac/rbacs.js';
import {type ClusterRole} from '../../../resources/rbac/cluster-role.js';
import {
  type RbacAuthorizationV1Api,
  type V1ClusterRole,
  type V1ClusterRoleBinding,
  type V1PolicyRule,
} from '@kubernetes/client-node';
import {K8ClientClusterRole} from './k8-client-cluster-role.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';

export class K8ClientRbacs implements Rbacs {
  public constructor(private readonly k8sRbacApi: RbacAuthorizationV1Api) {}

  public async createClusterRole(
    name: string,
    rules: Array<{
      apiGroups: string[];
      resources: string[];
      verbs: string[];
    }>,
    labels?: Record<string, string>,
  ): Promise<void> {
    const clusterRole: ClusterRole = new K8ClientClusterRole(name, rules, labels);
    try {
      await this.k8sRbacApi.createClusterRole({body: clusterRole.toV1ClusterRole()});
    } catch (error) {
      KubeApiResponse.throwError(error.response, ResourceOperation.CREATE, ResourceType.RBAC, undefined, name);
    }
  }

  public async clusterRoleExists(name: string): Promise<boolean> {
    return (await this.readClusterRole(name)) !== undefined;
  }

  public async readClusterRole(name: string): Promise<ClusterRole | undefined> {
    try {
      const v1ClusterRole: V1ClusterRole = await this.k8sRbacApi.readClusterRole({name});
      return new K8ClientClusterRole(
        name,
        (v1ClusterRole.rules ?? []).map(
          (rule: V1PolicyRule): {apiGroups: string[]; resources: string[]; verbs: string[]} => ({
            apiGroups: rule.apiGroups ?? [],
            resources: rule.resources ?? [],
            verbs: rule.verbs ?? [],
          }),
        ),
        v1ClusterRole.metadata?.labels,
      );
    } catch (error) {
      if (KubeApiResponse.isNotFound(error)) {
        return undefined;
      }
      KubeApiResponse.throwError(error, ResourceOperation.READ, ResourceType.RBAC, undefined, name);
    }
  }

  public async deleteClusterRole(name: string): Promise<void> {
    try {
      await this.k8sRbacApi.deleteClusterRole({name});
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.DELETE, ResourceType.RBAC, undefined, name);
    }
  }

  public async clusterRoleBindingExists(name: string): Promise<boolean> {
    try {
      await this.k8sRbacApi.readClusterRoleBinding({name});
      return true;
    } catch (error) {
      if (KubeApiResponse.isNotFound(error)) {
        return false;
      }
      KubeApiResponse.throwError(error, ResourceOperation.READ, ResourceType.RBAC, undefined, name);
    }
  }

  public async deleteClusterRoleBinding(name: string): Promise<void> {
    try {
      await this.k8sRbacApi.deleteClusterRoleBinding({name});
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.DELETE, ResourceType.RBAC, undefined, name);
    }
  }

  public async setHelmOwnership(name: string, releaseName: string, releaseNamespace: string): Promise<void> {
    const annotations: Record<string, string> = {
      'meta.helm.sh/release-name': releaseName,
      'meta.helm.sh/release-namespace': releaseNamespace,
    };
    const labels: Record<string, string> = {
      'app.kubernetes.io/managed-by': 'Helm',
    };

    try {
      const clusterRole: V1ClusterRole = await this.k8sRbacApi.readClusterRole({name});
      clusterRole.metadata ??= {};
      clusterRole.metadata.annotations = {...clusterRole.metadata.annotations, ...annotations};
      clusterRole.metadata.labels = {...clusterRole.metadata.labels, ...labels};
      await this.k8sRbacApi.replaceClusterRole({name, body: clusterRole});
    } catch (error) {
      if (!KubeApiResponse.isNotFound(error)) {
        KubeApiResponse.throwError(error, ResourceOperation.REPLACE, ResourceType.RBAC, undefined, name);
      }
    }

    try {
      const clusterRoleBinding: V1ClusterRoleBinding = await this.k8sRbacApi.readClusterRoleBinding({name});
      clusterRoleBinding.metadata ??= {};
      clusterRoleBinding.metadata.annotations = {...clusterRoleBinding.metadata.annotations, ...annotations};
      clusterRoleBinding.metadata.labels = {...clusterRoleBinding.metadata.labels, ...labels};
      await this.k8sRbacApi.replaceClusterRoleBinding({name, body: clusterRoleBinding});
    } catch (error) {
      if (!KubeApiResponse.isNotFound(error)) {
        KubeApiResponse.throwError(error, ResourceOperation.REPLACE, ResourceType.RBAC, undefined, name);
      }
    }
  }
}
