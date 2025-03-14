// SPDX-License-Identifier: Apache-2.0

import {type ObjectStorageBackend} from '../api/object-storage-backend.js';
import {FileStorageBackend} from './file-storage-backend.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import path from 'path';
import {dumpYaml, loadYaml} from '@kubernetes/client-node';
import {IllegalArgumentError} from '../../../core/errors/illegal-argument-error.js';

export class YamlFileStorageBackend extends FileStorageBackend implements ObjectStorageBackend {
  public constructor(basePath: string) {
    super(basePath);
  }

  public async readObject(key: string): Promise<object> {
    const data: Uint8Array = await this.readBytes(key);

    const filePath = path.join(this.basePath, key);
    if (!data) {
      throw new StorageBackendError(`failed to read file: ${filePath}`);
    }

    if (data.length === 0) {
      throw new StorageBackendError(`file is empty: ${filePath}`);
    }

    try {
      return loadYaml<object>(data.toString());
    } catch (e) {
      throw new StorageBackendError(`error parsing yaml file: ${filePath}`, e);
    }
  }

  public async writeObject(key: string, data: object): Promise<void> {
    if (!data) {
      throw new IllegalArgumentError('data must not be null or undefined');
    }

    const filePath = path.join(this.basePath, key);
    try {
      const yamlData = dumpYaml(data, {sortKeys: true});
      await this.writeBytes(key, new Uint8Array(Buffer.from(yamlData)));
    } catch (e) {
      throw new StorageBackendError(`error writing yaml file: ${filePath}`, e);
    }
  }
}
