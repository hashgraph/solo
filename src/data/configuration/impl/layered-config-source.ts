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
    const stringValue: string = this.forest.valueFor(key);

    if (!stringValue || stringValue.trim().length === 0) {
      return null;
    }

    const value: unknown = ReflectAssist.coerce(stringValue);
    if (typeof value === 'boolean') {
      return value as boolean;
    } else if (typeof value === 'string') {
      return value === 'true';
    } else if (typeof value === 'number') {
      return value !== 0;
    } else if (typeof value === 'object') {
      if (value === null || value === undefined) {
        return null;
      }
      return true;
    }

    throw new ConfigurationError('value is not a boolean');
  }

  public asNumber(key: string): number | null {
    const stringValue: string = this.forest.valueFor(key);

    if (!stringValue || stringValue.trim().length === 0) {
      return null;
    }

    const value: unknown = ReflectAssist.coerce(stringValue);
    if (typeof value === 'number') {
      return value as number;
    } else if (typeof value === 'object' && (value === null || value === undefined)) {
      return null;
    }

    throw new ConfigurationError('value is not a number');
  }

  public asObject<T>(cls: ClassConstructor<T>, key?: string): T {
    if (!cls) {
      throw new ConfigurationError('class constructor is required');
    }

    try {
      let object: object = null;

      if (key) {
        const node = this.forest.nodeFor(key);

        if (!node) {
          return null;
        }

        if (node.isLeaf()) {
          object = JSON.parse((node as LexerLeafNode).value);
        } else {
          object = (node as LexerInternalNode).toObject();
        }
      } else {
        object = this.forest.toObject();
      }

      return this.mapper.fromObject(cls, object);
    } catch (error) {
      throw new ConfigurationError('Failed to convert value to object', error);
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
      const objectArray: object[] = (node as LexerInternalNode).toObject() as object[];
      return plainToInstance(cls, objectArray);
    } catch (error) {
      throw new ConfigurationError('Failed to convert value to object array', error);
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
    } catch (error) {
      throw new ConfigurationError('Failed to convert value to object array', error);
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
