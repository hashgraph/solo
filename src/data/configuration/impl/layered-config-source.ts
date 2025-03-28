// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../spi/config-source.js';
import {type ObjectMapper} from '../../mapper/api/object-mapper.js';
import {IllegalArgumentError} from '../../../business/errors/illegal-argument-error.js';
import {type StorageBackend} from '../../backend/api/storage-backend.js';
import {type Forest} from '../../key/lexer/forest.js';
import {ConfigurationError} from '../api/configuration-error.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';
import {type LexerLeafNode} from '../../key/lexer/lexer-leaf-node.js';
import {type LexerInternalNode} from '../../key/lexer/lexer-internal-node.js';
import {plainToInstance} from 'class-transformer';
import {ReflectAssist} from '../../../business/utils/reflect-assist.js';

export abstract class LayeredConfigSource implements ConfigSource {
  /**
   * The forest model of the configuration keys and values.
   * @protected
   */
  protected forest: Forest;

  protected constructor(
    public readonly backend: StorageBackend,
    protected readonly mapper: ObjectMapper,
    public readonly prefix?: string,
  ) {
    if (!mapper) {
      throw new IllegalArgumentError('ObjectMapper is required');
    }
  }

  public abstract get name(): string;
  public abstract get ordinal(): number;

  public asBoolean(key: string): boolean | null {
    const stringVal: string = this.forest.valueFor(key);

    if (!stringVal || stringVal.trim().length === 0) {
      return null;
    }

    const val: unknown = ReflectAssist.coerce(stringVal);
    if (typeof val === 'boolean') {
      return val as boolean;
    } else if (typeof val === 'string') {
      return val === 'true';
    } else if (typeof val === 'number') {
      return val !== 0;
    } else if (typeof val === 'object') {
      if (val === null || val === undefined) {
        return null;
      }
      return true;
    }

    throw new ConfigurationError('value is not a boolean');
  }

  public asNumber(key: string): number | null {
    const stringVal: string = this.forest.valueFor(key);

    if (!stringVal || stringVal.trim().length === 0) {
      return null;
    }

    const val: unknown = ReflectAssist.coerce(stringVal);
    if (typeof val === 'number') {
      return val as number;
    } else if (typeof val === 'object') {
      if (val === null || val === undefined) {
        return null;
      }
    }

    throw new ConfigurationError('value is not a number');
  }

  public asObject<T>(cls: ClassConstructor<T>, key?: string): T {
    if (!cls) {
      throw new ConfigurationError('class constructor is required');
    }

    try {
      let obj: object = null;

      if (key) {
        const node = this.forest.nodeFor(key);

        if (!node) {
          return null;
        }

        if (node.isLeaf()) {
          obj = JSON.parse((node as LexerLeafNode).value);
        } else {
          obj = (node as LexerInternalNode).toObject();
        }
      } else {
        obj = this.forest.toObject();
      }

      return this.mapper.fromObject(cls, obj);
    } catch (e) {
      throw new ConfigurationError('Failed to convert value to object', e);
    }
  }

  public asObjectArray<T extends Array<T>>(cls: ClassConstructor<T>, key: string): T[] {
    if (!cls) {
      throw new ConfigurationError('class constructor is required');
    }

    if (!key) {
      throw new ConfigurationError('key is required');
    }

    const node = this.forest.nodeFor(key);
    if (!node) {
      return null;
    }

    if (!node.isArray()) {
      throw new ConfigurationError('value is not an array');
    }

    try {
      const objArray: object[] = (node as LexerInternalNode).toObject() as object[];
      return plainToInstance(cls, objArray);
    } catch (e) {
      throw new ConfigurationError('Failed to convert value to object array', e);
    }
  }

  public asString(key: string): string | null {
    return this.forest.valueFor(key) || null;
  }

  public asStringArray(key: string): string[] | null {
    if (!key) {
      throw new ConfigurationError('key is required');
    }

    const node = this.forest.nodeFor(key);
    if (!node) {
      return null;
    }

    if (!node.isArray()) {
      throw new ConfigurationError('value is not an array');
    }

    try {
      return (node as LexerInternalNode).toObject() as string[];
    } catch (e) {
      throw new ConfigurationError('Failed to convert value to object array', e);
    }
  }

  public properties(): Map<string, string> {
    return new Map<string, string>(this.forest.toFlatMap());
  }

  public propertyNames(): Set<string> {
    return new Set(this.forest.toFlatMap().keys());
  }

  public abstract load(): Promise<void>;
}
