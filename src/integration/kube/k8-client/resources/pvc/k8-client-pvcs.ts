// SPDX-License-Identifier: Apache-2.0

import {type Pvcs} from '../../../resources/pvc/pvcs.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';
import {
  type CoreV1Api,
  V1ObjectMeta,
  V1PersistentVolumeClaim,
  type V1PersistentVolumeClaimList,
  V1PersistentVolumeClaimSpec,
  V1VolumeResourceRequirements,
} from '@kubernetes/client-node';
import {Duration} from '../../../../../core/time/duration.js';
import {type Pvc} from '../../../resources/pvc/pvc.js';
import {KubePvcCreationFailedError} from '../../../errors/kube-pvc-creation-failed-error.js';
import {K8ClientPvc} from './k8-client-pvc.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {type PvcDetail} from '../../../resources/pvc/pvc-detail.js';
import {PvcName} from '../../../resources/pvc/pvc-name.js';
import {PvcReference} from '../../../resources/pvc/pvc-reference.js';
import {KubernetesQuantity} from '../../../../../business/utils/kubernetes-quantity.js';

export class K8ClientPvcs implements Pvcs {
  public constructor(private readonly kubeClient: CoreV1Api) {}

  public async delete(pvcReference: PvcReference): Promise<boolean> {
    try {
      await this.kubeClient.deleteNamespacedPersistentVolumeClaim({
        name: pvcReference.name.toString(),
        namespace: pvcReference.namespace.toString(),
      });
    } catch (error) {
      KubeApiResponse.throwError(
        error,
        ResourceOperation.DELETE,
        ResourceType.PERSISTENT_VOLUME_CLAIM,
        pvcReference.namespace,
        pvcReference.name.toString(),
      );
    }
    return true;
  }

  public async list(namespace: NamespaceName, labels: string[]): Promise<string[]> {
    const pvcs: string[] = [];
    const labelSelector: string = labels ? labels.join(',') : undefined;

    let resp: V1PersistentVolumeClaimList;
    try {
      resp = await this.kubeClient.listNamespacedPersistentVolumeClaim({
        namespace: namespace.name,
        labelSelector,
        timeoutSeconds: Duration.ofMinutes(5).toMillis(),
      });
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.LIST, ResourceType.PERSISTENT_VOLUME_CLAIM, namespace, '');
    }

    for (const item of resp.items) {
      pvcs.push(item.metadata!.name as string);
    }

    return pvcs;
  }

  public async readAll(namespace: NamespaceName, labels?: string[]): Promise<PvcDetail[]> {
    const labelSelector: string = labels ? labels.join(',') : undefined;

    let response: V1PersistentVolumeClaimList;
    try {
      response = await this.kubeClient.listNamespacedPersistentVolumeClaim({
        namespace: namespace.name,
        labelSelector,
        timeoutSeconds: Duration.ofMinutes(5).toMillis(),
      });
    } catch (error) {
      KubeApiResponse.throwError(error, ResourceOperation.LIST, ResourceType.PERSISTENT_VOLUME_CLAIM, namespace, '');
    }

    return (response.items ?? []).map((item: V1PersistentVolumeClaim): PvcDetail => {
      const requestedStorage: string | undefined = item.spec?.resources?.requests?.['storage'] as string | undefined;
      return {
        pvcReference: PvcReference.of(namespace, PvcName.of(item.metadata.name)),
        phase: item.status?.phase ?? 'Unknown',
        requestedStorageBytes: KubernetesQuantity.toBytes(requestedStorage),
        storageClassName: item.spec?.storageClassName,
      };
    });
  }

  public async create(pvcReference: PvcReference, labels: Record<string, string>, accessModes: string[]): Promise<Pvc> {
    const v1VolumeResourceRequirements: V1VolumeResourceRequirements = new V1VolumeResourceRequirements();
    v1VolumeResourceRequirements.requests = labels;

    const v1Spec: V1PersistentVolumeClaimSpec = new V1PersistentVolumeClaimSpec();
    v1Spec.accessModes = accessModes;
    v1Spec.resources = v1VolumeResourceRequirements;

    const v1Metadata: V1ObjectMeta = new V1ObjectMeta();
    v1Metadata.name = pvcReference.name.toString();

    const v1Pvc: V1PersistentVolumeClaim = new V1PersistentVolumeClaim();
    v1Pvc.spec = v1Spec;
    v1Pvc.metadata = v1Metadata;

    let result: V1PersistentVolumeClaim;
    try {
      result = await this.kubeClient.createNamespacedPersistentVolumeClaim({
        namespace: pvcReference.namespace.toString(),
        body: v1Pvc,
      });
    } catch (error) {
      KubeApiResponse.throwError(
        error,
        ResourceOperation.CREATE,
        ResourceType.PERSISTENT_VOLUME_CLAIM,
        pvcReference.namespace,
        pvcReference.name.toString(),
      );
    }

    if (result) {
      return new K8ClientPvc(pvcReference);
    } else {
      throw new KubePvcCreationFailedError();
    }
  }
}
