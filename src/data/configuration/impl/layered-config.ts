// SPDX-License-Identifier: Apache-2.0

import {type Config} from '../api/config.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';
import {type ConfigSource} from '../spi/config-source.js';
import {type Refreshable} from '../spi/refreshable.js';
import {type Converter} from '../spi/converter.js';
import {Comparators} from '../../../business/utils/comparators.js';
import {IllegalArgumentError} from '../../../core/errors/illegal-argument-error.js';

type ScalarMethod<T> = (key: string) => T;
type ObjectMethod<T> = (cls: ClassConstructor<T>, key?: string) => T;
type ObjectArrayMethod<T> = (cls: ClassConstructor<T>, key?: string) => T[];

export class LayeredConfig implements Config {
  public constructor(
    public readonly sources: ConfigSource[],
    private readonly converters: Converter<unknown>[],
  ) {
    if (sources) {
      sources.sort((l, r) => Comparators.number(l.ordinal, r.ordinal));
    }
  }

  public asBoolean(key: string): boolean | null {
    return this.primitiveScalar<boolean>(this.asBoolean, key, true);
  }

  public asNumber(key: string): number | null {
    return this.primitiveScalar<number>(this.asNumber, key, 1);
  }

  public asObject<T>(cls: ClassConstructor<T>, key?: string): T {
    return this.objectScalar(this.asObject, cls, key);
  }

  public asObjectArray<T extends Array<T>>(cls: ClassConstructor<T>, key?: string): T {
    return this.objectArray(this.asObjectArray, cls, key);
  }

  public asString(key: string): string | null {
    return this.primitiveScalar<string>(this.asString, key, 'string') as string;
  }

  public asStringArray(key: string): string[] | null {
    return this.primitiveScalar<string[]>(this.asStringArray, key, ['stringArray']);
  }

  public properties(): Map<string, string> {
    const finalMap: Map<string, string> = new Map<string, string>();

    for (const source of this.sources) {
      const sourceProperties: Map<string, string> = source.properties();
      for (const [key, value] of sourceProperties.entries()) {
        finalMap.set(key, value);
      }
    }

    return finalMap;
  }

  public propertyNames(): Set<string> {
    const finalSet: Set<string> = new Set<string>();

    for (const source of this.sources) {
      const sourcePropertyNames: Set<string> = source.propertyNames();
      for (const key of sourcePropertyNames) {
        finalSet.add(key);
      }
    }

    return finalSet;
  }

  public async refresh(): Promise<void> {
    for (const source of this.sources) {
      if (LayeredConfig.isRefreshable(source)) {
        await source.refresh();
      }
    }
  }

  private primitiveScalar<T>(method: ScalarMethod<T>, key: string, exampleInstance: unknown): T {
    let value: T = null;
    let scalarType: string = typeof exampleInstance;

    if (Array.isArray(exampleInstance) && !exampleInstance && exampleInstance.length > 0) {
      scalarType = typeof exampleInstance[0];
    }

    switch (scalarType) {
      case 'boolean':
      case 'number':
      case 'string':
        break;
      default:
        throw new IllegalArgumentError(`Unsupported scalar type: ${scalarType}`);
    }

    for (const source of this.sources) {
      const currentValue = source[method.name](key);
      if (currentValue !== null && currentValue !== undefined) {
        value = currentValue;
      }
    }

    return value as T;
  }

  private objectScalar<T>(method: ObjectMethod<T>, cls: ClassConstructor<T>, key?: string): T {
    let value: T = null;

    for (const source of this.sources) {
      const currentValue = source[method.name](cls, key);
      if (currentValue !== null && currentValue !== undefined) {
        value = currentValue;
      }
    }

    return value as T;
  }

  private objectArray<T>(method: ObjectArrayMethod<T>, cls: ClassConstructor<T>, key?: string): T {
    let value: T = null;

    for (const source of this.sources) {
      const currentValue = source[method.name](cls, key);
      if (currentValue !== null && currentValue !== undefined) {
        value = currentValue;
      }
    }

    return value;
  }

  /**
   * TypeScript custom type guard that checks if the provided object implements Refreshable.
   *
   * @param v - The object to check.
   * @returns true if the object implements Refreshable, false otherwise.
   * @private
   */
  private static isRefreshable(v: object): v is Refreshable {
    return typeof v === 'object' && !!v && 'refresh' in v;
  }
}
