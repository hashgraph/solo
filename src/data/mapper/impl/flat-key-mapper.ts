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

    for (const [key, val] of Object.entries(data)) {
      this.processRootKVPair(fkm, key, val);
    }

    return fkm;
  }

  private processRootKVPair(fkm: Map<string, string>, key: string, val: unknown) {
    // If the value is null or undefined, we don't need to do anything since the key should not be added to the map.
    if (val === null || val === undefined) {
      return;
    }

    const valType = typeof val;

    switch (valType) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'bigint':
        fkm.set(this.formatter.normalize(key), val.toString());
        break;
      case 'object':
        if (Array.isArray(val)) {
          this.processArray(fkm, key, val);
        } else {
          this.processObject(fkm, key, val as object);
        }
        break;
      default:
        throw new ObjectMappingError(
          `Unsupported value type [ key = '${key}', value = '${val}', type = '${valType}' ]`,
        );
    }
  }

  private processArray(fkm: Map<string, string>, key: string, val: unknown[]) {
    for (let i = 0; i < val.length; i++) {
      const arrayKey = this.formatter.join(key, i.toString());
      this.processRootKVPair(fkm, arrayKey, val[i]);
    }
  }

  private processObject(fkm: Map<string, string>, key: string, val: object) {
    for (const [subKey, subVal] of Object.entries(val)) {
      const fullKey = this.formatter.join(key, subKey);
      this.processRootKVPair(fkm, fullKey, subVal);
    }
  }
}
