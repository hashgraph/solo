// SPDX-License-Identifier: Apache-2.0

import {LayeredModelConfigSource} from './layered-model-config-source.js';
import {type LocalConfig} from '../../schema/model/local/local-config.js';
import {type LocalConfigSchema} from '../../schema/migration/impl/local/local-config-schema.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type StorageBackend} from '../../backend/api/storage-backend.js';

export class LocalConfigSource extends LayeredModelConfigSource<LocalConfig> {
  public constructor(fileName: string, schema: LocalConfigSchema, mapper: ObjectMapper, backend: StorageBackend) {
    super(fileName, schema, backend, mapper);
  }

  public get name(): string {
    return 'LocalConfigSource';
  }

  public get ordinal(): number {
    return 200;
  }
}
