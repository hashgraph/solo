// SPDX-License-Identifier: Apache-2.0

import {LayeredModelConfigSource} from './layered-model-config-source.js';
import {type LocalConfig} from '../../schema/model/local/local-config.js';
import {type LocalConfigSchema} from '../../schema/migration/impl/local/local-config-schema.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type Refreshable} from '../spi/refreshable.js';
import {type Persistable} from '../spi/persistable.js';
import {type ConfigMutator} from '../spi/config-mutator.js';
import {type ObjectStorageBackend} from '../../backend/api/object-storage-backend.js';
import {ReflectAssist} from '../../../business/utils/reflect-assist.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {instanceToPlain} from 'class-transformer';

export class LocalConfigSource
  extends LayeredModelConfigSource<LocalConfig>
  implements Refreshable, Persistable, ConfigMutator
{
  public constructor(fileName: string, schema: LocalConfigSchema, mapper: ObjectMapper, backend: ObjectStorageBackend) {
    super(fileName, schema, backend, mapper);
  }

  public get name(): string {
    return 'LocalConfigSource';
  }

  public get ordinal(): number {
    return 200;
  }

  public async refresh(): Promise<void> {
    await this.load();
  }

  public async persist(): Promise<void> {
    if (!ReflectAssist.isObjectStorageBackend(this.backend)) {
      throw new ConfigurationError('backend must be a persistable storage backend');
    }

    await this.backend.writeObject(this.key, instanceToPlain(this.modelData));
  }

  public putObject<T>(key: string, value: T): void {}

  public putObjectArray<T>(key: string, value: T[]): void {}

  public putScalar(key: string, value: string | number | boolean): void {}

  public putScalarArray(key: string, value: string[] | number[] | boolean[]): void {}
}
