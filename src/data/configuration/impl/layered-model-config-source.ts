// SPDX-License-Identifier: Apache-2.0

import {LayeredConfigSource} from './layered-config-source.js';
import {type ModelConfigSource} from '../spi/model-config-source.js';
import {type StorageBackend} from '../../backend/api/storage-backend.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type Schema} from '../../schema/migration/api/schema.js';

export abstract class LayeredModelConfigSource<T> extends LayeredConfigSource implements ModelConfigSource<T> {
  public readonly schema: Schema<T>;
  protected _modelData: T;

  protected constructor(
    public readonly modelData: T,
    schema: Schema<T>,
    backend: StorageBackend,
    mapper: ObjectMapper,
    prefix?: string,
  ) {
    super(backend, mapper, prefix);
    this.schema = schema;
  }

  public async load(): Promise<void> {
    const data: object = await this.backend;
  }
}
