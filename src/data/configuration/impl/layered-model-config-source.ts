// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../core/errors/solo-errors.js';
import {LayeredConfigSource} from './layered-config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {type SchemaDefinition} from '../../schema/migration/api/schema-definition.js';
import {ReflectAssist} from '../../../business/utils/reflect-assist.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {Forest} from '../../key/lexer/forest.js';
import {DeclaredTypeCoercer} from '../../key/declared-type-coercer.js';
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
    public readonly schema: SchemaDefinition<T>,
    backend: ObjectStorageBackend,
    mapper: ObjectMapper,
    prefix?: string,
  ) {
    super(backend, mapper, prefix);

    if (!key) {
      throw new SoloErrors.validation.illegalArgument('key must not be null or undefined');
    }

    if (!ReflectAssist.isObjectStorageBackend(this.backend)) {
      throw new SoloErrors.validation.illegalArgument('backend must be an object storage backend');
    }

    if (!schema) {
      throw new SoloErrors.validation.illegalArgument('schema must not be null or undefined');
    }

    if (!mapper) {
      throw new SoloErrors.validation.illegalArgument('mapper must not be null or undefined');
    }
  }

  public async load(): Promise<void> {
    if (!ReflectAssist.isObjectStorageBackend(this.backend)) {
      throw new ConfigurationError('backend must be an object storage backend');
    }

    this.forest = null;
    const value: object = await this.backend.readObject(this.key);
    this.modelData = await this.schema.transform(value);

    // `schema.transform()` only migrates and maps; `class-transformer` assigns whatever the file held
    // without converting it, so the declared type has to be enforced here. It matters most for YAML:
    // the parser reads YAML 1.2, where `off`, `no` and `yes` are strings, so `skipNodePing: off` would
    // otherwise reach the schema as the truthy string `"off"` and switch the flag *on*.
    const flattened: Map<string, string> = this.mapper.toFlatKeyMap(this.modelData);
    DeclaredTypeCoercer.coerce(flattened, (): string => `Config file '${this.key}'`);

    this.forest = Forest.from(flattened);
  }
}
