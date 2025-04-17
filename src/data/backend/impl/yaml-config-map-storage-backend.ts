// SPDX-License-Identifier: Apache-2.0

import yaml from 'yaml';
import {ConfigMapStorageBackend} from './config-map-storage-backend.js';
import {type ObjectStorageBackend} from '../api/object-storage-backend.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {IllegalArgumentError} from '../../../core/errors/illegal-argument-error.js';

export class YamlConfigMapStorageBackend extends ConfigMapStorageBackend implements ObjectStorageBackend {
  public async readObject(key: string): Promise<object> {
    const data: Buffer = await this.readBytes(key);
    if (!data) {
      throw new StorageBackendError(`failed to read key: ${key} from config map`);
    }

    if (data.length === 0) {
      throw new StorageBackendError(`data is empty for key: ${key}`);
    }

    try {
      return yaml.parse(data.toString('utf8'));
    } catch (error) {
      throw new StorageBackendError(`error parsing yaml from key: ${key}`, error);
    }
  }

  public async writeObject(key: string, data: object): Promise<void> {
    if (!data) {
      throw new IllegalArgumentError('data must not be null or undefined');
    }

    try {
      const yamlData: string = yaml.stringify(data, {sortMapEntries: true});
      await this.writeBytes(key, Buffer.from(yamlData, 'utf8'));
    } catch (error) {
      throw new StorageBackendError(`error writing yaml for key: ${key} to config map`, error);
    }
  }
}
