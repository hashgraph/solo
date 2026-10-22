// SPDX-License-Identifier: Apache-2.0

import {type StorageV1Api, type V1StorageClass, type V1StorageClassList} from '@kubernetes/client-node';
import {type StorageClasses} from '../../../resources/storage-class/storage-classes.js';
import {type StorageClass} from '../../../resources/storage-class/storage-class.js';
import {K8ClientStorageClass} from './k8-client-storage-class.js';
import {KubeApiResponse} from '../../../kube-api-response.js';
import {ResourceOperation} from '../../../resources/resource-operation.js';
import {ResourceType} from '../../../resources/resource-type.js';
import {type NamespaceName} from '../../../../../types/namespace/namespace-name.js';

const DEFAULT_CLASS_ANNOTATION: string = 'storageclass.kubernetes.io/is-default-class';

export class K8ClientStorageClasses implements StorageClasses {
  public constructor(private readonly storageApi: StorageV1Api) {}

  /**
   * The names of the provisioner-specific settings, dropping their values. Values are provisioner-defined and some
   * drivers accept credentials there, so they are discarded here at the API boundary rather than carried on the model
   * where a later change could log them.
   */
  private static extractParameterKeys(item: V1StorageClass): string[] | undefined {
    const keys: string[] = Object.keys(item.parameters ?? {});

    return keys.length > 0 ? keys : undefined;
  }

  /**
   * The node label keys an `allowedTopologies` restriction is expressed over. The keys are what determine whether the
   * restriction can overlap with where a pod is allowed to run, which is the part worth reporting.
   */
  private static extractTopologyKeys(item: V1StorageClass): string[] | undefined {
    const keys: string[] = (item.allowedTopologies ?? []).flatMap((term): string[] =>
      (term.matchLabelExpressions ?? []).map((expression): string => expression.key),
    );

    return keys.length > 0 ? [...new Set(keys)] : undefined;
  }

  public async list(): Promise<StorageClass[]> {
    try {
      const response: V1StorageClassList = await this.storageApi.listStorageClass();
      const storageClasses: StorageClass[] = [];

      if (response?.items?.length > 0) {
        for (const item of response.items as V1StorageClass[]) {
          const isDefault: boolean = item.metadata?.annotations?.[DEFAULT_CLASS_ANNOTATION] === 'true';
          storageClasses.push(
            new K8ClientStorageClass(
              item.metadata?.name ?? '',
              item.provisioner ?? '',
              isDefault,
              item.volumeBindingMode,
              item.reclaimPolicy,
              item.allowVolumeExpansion,
              K8ClientStorageClasses.extractParameterKeys(item),
              item.mountOptions,
              K8ClientStorageClasses.extractTopologyKeys(item),
            ),
          );
        }
      }

      return storageClasses;
    } catch (error) {
      KubeApiResponse.throwError(
        error,
        ResourceOperation.LIST,
        ResourceType.STORAGE_CLASS,
        undefined as unknown as NamespaceName,
        '',
      );
    }
  }
}
