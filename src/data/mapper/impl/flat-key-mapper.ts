// SPDX-License-Identifier: Apache-2.0

import {type KeyFormatter} from '../../key/key-formatter.js';
import {ConfigKeyFormatter} from '../../key/config-key-formatter.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {ObjectMappingError} from '../api/object-mapping-error.js';

export class FlatKeyMapper {
  public constructor(private readonly formatter: KeyFormatter = ConfigKeyFormatter.instance()) {
    if (!formatter) {
      throw new IllegalArgumentError('formatter must be provided');
    }
  }

  public flatten(data: object): Map<string, string> {
    const fkm: Map<string, string> = new Map();

    for (const [key, value] of Object.entries(data)) {
      this.flattenKVPair(fkm, key, value);
    }

    return fkm;
  }

  private flattenKVPair(fkm: Map<string, string>, key: string, value: unknown) {
    // If the value is null or undefined, we don't need to do anything since the key should not be added to the map.
    if (value === null || value === undefined) {
      return;
    }

    const valueType = typeof value;

    switch (valueType) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'bigint':
        fkm.set(this.formatter.normalize(key), value.toString());
        break;
      case 'object':
        if (Array.isArray(value)) {
          this.flattenArray(fkm, key, value);
        } else {
          this.flattenObject(fkm, key, value as object);
        }
        break;
      default:
        throw new ObjectMappingError(
          `Unsupported value type [ key = '${key}', value = '${value}', type = '${valueType}' ]`,
        );
    }
  }

  private flattenArray(fkm: Map<string, string>, key: string, value: unknown[]) {
    for (let index = 0; index < value.length; index++) {
      const arrayKey = this.formatter.join(key, index.toString());
      this.flattenKVPair(fkm, arrayKey, value[index]);
    }
  }

  private flattenObject(fkm: Map<string, string>, key: string, value: object) {
    for (const [subKey, subValue] of Object.entries(value)) {
      const fullKey = this.formatter.join(key, subKey);
      this.flattenKVPair(fkm, fullKey, subValue);
    }
  }
}
