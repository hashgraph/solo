// SPDX-License-Identifier: Apache-2.0

import {type Pvcs} from '../../../resources/pvc/pvcs.js';
import {type NamespaceName} from '../../../resources/namespace/namespace-name.js';
import {StatusCodes} from 'http-status-codes';
import {
  V1ObjectMeta,
  V1PersistentVolumeClaim,
  V1PersistentVolumeClaimSpec,
  V1VolumeResourceRequirements,
  type CoreV1Api,
} from '@kubernetes/client-node';
import {Duration} from '../../../../../core/time/duration.js';
import {type Pvc} from '../../../resources/pvc/pvc.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {K8ClientPvc} from './k8-client-pvc.js';
import {type IncomingMessage} from 'http';
import {type PvcReference as PvcReference} from '../../../resources/pvc/pvc-reference.js';

export class K8ClientPvcs implements Pvcs {
  constructor(private readonly kubeClient: CoreV1Api) {}

  public async delete(pvcReference: PvcReference): Promise<boolean> {
    let resp: {response: any; body?: V1PersistentVolumeClaim};
    try {
      resp = await this.kubeClient.deleteNamespacedPersistentVolumeClaim(
        pvcReference.name.toString(),
        pvcReference.namespace.toString(),
      );
    } catch (error) {
      throw new SoloError('Failed to delete pvc', error);
    }

    KubeApiResponse.check(
      resp.response,
      ResourceOperation.DELETE,
      ResourceType.PERSISTENT_VOLUME_CLAIM,
      pvcReference.namespace,
      pvcReference.name.toString(),
    );

    return resp.response.statusCode === StatusCodes.OK;
  }

  public async list(namespace: NamespaceName, labels: string[]): Promise<string[]> {
    const pvcs: string[] = [];
    const labelSelector: string = labels ? labels.join(',') : undefined;

    let resp: {body: any; response?: IncomingMessage};
    try {
      resp = await this.kubeClient.listNamespacedPersistentVolumeClaim(
        namespace.name,
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
    } catch (error) {
      throw new SoloError('Failed to list pvcs', error);
    }

    KubeApiResponse.check(resp.response, ResourceOperation.LIST, ResourceType.PERSISTENT_VOLUME_CLAIM, namespace, '');

    for (const item of resp.body.items) {
      pvcs.push(item.metadata!.name as string);
    }

    return pvcs;
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

    let result: {response: any; body?: V1PersistentVolumeClaim};
    try {
      result = await this.kubeClient.createNamespacedPersistentVolumeClaim(pvcReference.namespace.toString(), v1Pvc);
    } catch (error) {
      throw new SoloError('Failed to create pvc', error);
    }

    KubeApiResponse.check(
      result.response,
      ResourceOperation.CREATE,
      ResourceType.PERSISTENT_VOLUME_CLAIM,
      pvcReference.namespace,
      pvcReference.name.toString(),
    );

    if (result?.body) {
      return new K8ClientPvc(pvcReference);
    } else {
      throw new SoloError('Failed to create pvc');
    }
  }
}
