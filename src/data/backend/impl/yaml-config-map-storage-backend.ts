// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../core/errors/solo-errors.js';
import yaml from 'yaml';
import {ConfigMapStorageBackend} from './config-map-storage-backend.js';
import {type ObjectStorageBackend} from '../api/object-storage-backend.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {type ConfigMap} from '../../../integration/kube/resources/config-map/config-map.js';

/**
 * YamlConfigMapStorageBackend is a storage backend that uses a {@link ConfigMap} to store data.
 * The key will be the name of the property within the data object within the ConfigMap.
 */
export class YamlConfigMapStorageBackend extends ConfigMapStorageBackend implements ObjectStorageBackend {
  public async readObject(key: string): Promise<object> {
    const data: Buffer = await this.readBytes(key);
    const content: string = data?.toString('utf8') ?? '';

    if (content.length === 0) {
      throw new SoloErrors.config.remoteDataInvalid(key, 'the value is empty', content);
    }

    let parsed: unknown;
    try {
      parsed = yaml.parse(content);
    } catch (error) {
      throw new SoloErrors.config.remoteDataInvalid(key, 'the value is not parseable as YAML', content, error);
    }

    // yaml.parse() resolves whitespace-only, comment-only, scalar, and sequence documents without
    // throwing; returning those would defer the failure to the schema layer with no trace of the cause.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SoloErrors.config.remoteDataInvalid(
        key,
        'the value is valid YAML but does not describe a configuration object',
        content,
      );
    }

    return parsed;
  }

  public async writeObject(key: string, data: object): Promise<void> {
    if (!data) {
      throw new SoloErrors.validation.illegalArgument('data must not be null or undefined');
    }

    try {
      const yamlData: string = yaml.stringify(data, {sortMapEntries: true});
      await this.writeBytes(key, Buffer.from(yamlData, 'utf8'));
    } catch (error) {
      throw new StorageBackendError(`error writing yaml for key: ${key} to config map`, error);
    }
  }

  public getConfigMap(): ConfigMap {
    return this.configMap;
  }
}
