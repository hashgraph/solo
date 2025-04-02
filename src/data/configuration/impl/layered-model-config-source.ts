// SPDX-License-Identifier: Apache-2.0

import {LayeredConfigSource} from './layered-config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type Schema} from '../../schema/migration/api/schema.js';
import {ReflectAssist} from '../../../business/utils/reflect-assist.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {Forest} from '../../key/lexer/forest.js';
import {type ObjectStorageBackend} from '../../backend/api/object-storage-backend.js';
import {type ModelConfigSource} from '../spi/model-config-source.js';

export abstract class LayeredModelConfigSource<T extends object>
  extends LayeredConfigSource
  implements ModelConfigSource<T>
{
  private _modelData: T;

  public get modelData(): T {
    return this._modelData;
  }

  protected set modelData(value: T) {
    this._modelData = value;
  }

  protected constructor(
    protected readonly key: string,
    public readonly schema: Schema<T>,
    backend: ObjectStorageBackend,
    mapper: ObjectMapper,
    prefix?: string,
  ) {
    super(backend, mapper, prefix);

    if (!key) {
      throw new IllegalArgumentError('key must not be null or undefined');
    }

    if (!ReflectAssist.isObjectStorageBackend(this.backend)) {
      throw new IllegalArgumentError('backend must be an object storage backend');
    }

    if (!schema) {
      throw new IllegalArgumentError('schema must not be null or undefined');
    }

    if (!mapper) {
      throw new IllegalArgumentError('mapper must not be null or undefined');
    }
  }

  public async load(): Promise<void> {
    if (!ReflectAssist.isObjectStorageBackend(this.backend)) {
      throw new ConfigurationError('backend must be an object storage backend');
    }

    this.forest = null;
    const value: object = await this.backend.readObject(this.key);
    this.modelData = await this.schema.transform(value);
    this.forest = Forest.from(this.mapper.toFlatKeyMap(this.modelData));
  }
}
