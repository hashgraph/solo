// SPDX-License-Identifier: Apache-2.0

import {LayeredModelConfigSource} from './layered-model-config-source.js';
import {type Persistable} from '../spi/persistable.js';
import {type ConfigMutator} from '../spi/config-mutator.js';
import {ReflectAssist} from '../../../business/utils/reflect-assist.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {instanceToPlain} from 'class-transformer';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {type Schema} from '../../schema/migration/api/schema.js';
import {type ObjectStorageBackend} from '../../backend/api/object-storage-backend.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type Primitive} from '../../../business/utils/primitive.js';

export abstract class MutableModelConfigSource<T extends object>
  extends LayeredModelConfigSource<T>
  implements Persistable, ConfigMutator
{
  protected constructor(
    key: string,
    schema: Schema<T>,
    backend: ObjectStorageBackend,
    mapper: ObjectMapper,
    prefix?: string,
  ) {
    super(key, schema, backend, mapper, prefix);
  }

  public async persist(): Promise<void> {
    if (!ReflectAssist.isObjectStorageBackend(this.backend)) {
      throw new ConfigurationError('backend must be a persistable storage backend');
    }

    await this.backend.writeObject(this.key, instanceToPlain(this.modelData));
  }

  public putObject<T>(key: string, value: T): void {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    this.mapper.applyPropertyValue(this.modelData, key, value as object);
    this.forest.addOrReplaceValue(key, JSON.stringify(value));
  }

  public putObjectArray<T>(key: string, value: T[]): void {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    this.mapper.applyPropertyValue(this.modelData, key, value);
    this.forest.addOrReplaceArray(key, value);
  }

  public putScalar(key: string, value: Primitive): void {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    if (!this.forest.has(key)) {
      throw new ConfigurationError(`model object does not support the specified key: ${key}`);
    }

    const stringValue: string = value === null ? null : value.toString();
    this.forest.addOrReplaceValue(key, stringValue);
    this.mapper.applyPropertyValue(this.modelData, key, value);
  }

  public putScalarArray(key: string, value: Primitive[]): void {
    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    this.forest.addOrReplaceArray(key, value);
    this.mapper.applyPropertyValue(this.modelData, key, value);
  }
}
