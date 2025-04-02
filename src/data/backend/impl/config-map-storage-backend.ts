// SPDX-License-Identifier: Apache-2.0

import {type StorageBackend} from '../api/storage-backend.js';
import {StorageOperation} from '../api/storage-operation.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import {container} from 'tsyringe-neo';
import {MissingArgumentError} from '../../../core/errors/missing-argument-error.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {type Context} from '../../../core/config/remote/types.js';
import {type K8} from '../../../integration/kube/k8.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';
import {StorageBackendError} from '../api/storage-backend-error.js';

export class ConfigMapStorageBackend implements StorageBackend {
  private readonly k8: K8;

  // TODO only pass in ConfigMap, no K8 references.  K8 will be handled from the business layer
  //  the key is the key within the data object within the configMap
  public constructor(
    private readonly namespaceName: NamespaceName,
    private readonly kubeContext: Context,
    private readonly labels: Record<string, string> = {},
  ) {
    if (!this.kubeContext) {
      throw new MissingArgumentError('ConfigMapStorageBackend is missing the kubeContext argument');
    }

    this.k8 = container.resolve<K8Factory>(InjectTokens.K8Factory).getK8(this.kubeContext);
  }

  public async delete(key: string): Promise<void> {}

  public isSupported(op: StorageOperation): boolean {
    switch (op) {
      case StorageOperation.List:
      case StorageOperation.ReadBytes:
      case StorageOperation.WriteBytes:
      case StorageOperation.Delete: {
        return true;
      }
      default: {
        return false;
      }
    }
  }

  public async list(): Promise<string[]> {
    return [];
  }

  public async readBytes(key: string): Promise<Buffer> {
    try {
      const configMap: ConfigMap = await this.k8.configMaps().read(this.namespaceName, key);

      if (configMap) {
        const data: Record<string, string> = configMap.data;

        if (data && Object.keys(data).length > 0) {
          const value: string = Object.values(data)[0];
          return Buffer.from(value, 'utf8');
        } else {
          throw new StorageBackendError(
            `config map is empty: ${key}, from namespace: ${this.namespaceName}, context: ${this.kubeContext}`,
          );
        }
      } else {
        throw new StorageBackendError(
          `failed to read config map: ${key}, from namespace: ${this.namespaceName}, context: ${this.kubeContext}`,
        );
      }
    } catch (error) {
      throw error instanceof StorageBackendError
        ? error
        : new StorageBackendError(
            `error reading config map: ${key}, from namespace: ${this.namespaceName}, context: ${this.kubeContext}`,
            error,
          );
    }
  }

  public async writeBytes(key: string, data: Buffer): Promise<void> {
    return;
  }
}
