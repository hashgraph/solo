// SPDX-License-Identifier: Apache-2.0

import {type StorageBackend} from '../api/storage-backend.js';
import {StorageOperation} from '../api/storage-operation.js';
import {MissingArgumentError} from '../../../core/errors/missing-argument-error.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';
import {StorageBackendError} from '../api/storage-backend-error.js';

/**
 * ConfigMapStorageBackend is a storage backend that uses a {@link ConfigMap} to store data.
 * The key will be the name of the property within the data object within the ConfigMap.
 */
export class ConfigMapStorageBackend implements StorageBackend {
  public constructor(private readonly configMap: ConfigMap) {
    if (!this.configMap) {
      throw new MissingArgumentError('ConfigMapStorageBackend is missing the configMap argument');
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      const data: Record<string, string> = this.configMap.data;

      if (data && Object.keys(data).length > 0 && data.hasOwnProperty(key)) {
        delete data[key];
      } else {
        throw new StorageBackendError(`key: ${key} not found in config map`);
      }
    } catch (error) {
      throw error instanceof StorageBackendError
        ? error
        : new StorageBackendError(`error deleting config map data key: ${key}`, error);
    }
  }

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
    const data: Record<string, string> = this.configMap.data;

    return data ? Object.keys(data) : [];
  }

  public async readBytes(key: string): Promise<Buffer> {
    try {
      const data: Record<string, string> = this.configMap.data;

      if (data && Object.keys(data).length > 0) {
        const value: string = Object.values(data)[0];
        return Buffer.from(value, 'utf8');
      } else {
        throw new StorageBackendError(`config map is empty: ${key}`);
      }
    } catch (error) {
      throw error instanceof StorageBackendError
        ? error
        : new StorageBackendError(`error reading config map: ${key}`, error);
    }
  }

  public async writeBytes(key: string, data: Buffer): Promise<void> {
    try {
      this.configMap.data[key] = data.toString('utf8');
    } catch (error) {
      throw error instanceof StorageBackendError
        ? error
        : new StorageBackendError(`error writing config map: ${key}`, error);
    }
  }
}
