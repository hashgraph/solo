// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../../../src/data/configuration/spi/config-source.js';
import {type StorageBackend} from '../../../src/data/backend/api/storage-backend.js';
import {type ClassConstructor} from '../../../src/business/utils/class-constructor.type.js';
import {type Refreshable} from '../../../src/data/configuration/spi/refreshable.js';

export class SimpleConfigSourceFixture implements ConfigSource, Refreshable {
  // used for testing to fake a refresh
  public props2: Map<string, string> = new Map<string, string>();

  public constructor(
    public readonly name: string,
    public readonly ordinal: number,
    public readonly prefix: string,
    public readonly backend: StorageBackend,
    public props: Map<string, string> = new Map<string, string>(),
  ) {}

  asBoolean(key: string): boolean | null {
    const value: string = this.props.get(key);
    if (value === null || value === undefined || typeof value !== 'string') {
      return null;
    }
    return value.toLowerCase() === 'true';
  }

  asNumber(key: string): number | null {
    const value: string = this.props.get(key);
    if (value === null || value === undefined) {
      return null;
    }
    return Number(value);
  }

  asObject<T>(cls: ClassConstructor<T>, key?: string): T | null {
    const value: string | undefined = this.props.get(key ?? '');
    if (!value) {
      return null;
    }

    try {
      const parsedValue: unknown = JSON.parse(value);
      if (typeof parsedValue !== 'object' || parsedValue === null) {
        return null;
      }

      // Create a new instance and assign properties manually
      const instance: T = new cls();
      Object.assign(instance, parsedValue);
      return instance;
    } catch {
      return null;
    }
  }

  asObjectArray<T>(cls: ClassConstructor<T>, key?: string): T[] {
    const value: string | undefined = this.props.get(key ?? '');
    if (!value) {
      return null;
    }

    try {
      const parsedValue: unknown = JSON.parse(value);

      if (!Array.isArray(parsedValue)) {
        return null;
      }

      return parsedValue
        .filter(item => typeof item === 'object' && item !== null)
        .map(item => {
          const instance: T = new cls();
          Object.assign(instance, item);
          return instance;
        });
    } catch {
      return null;
    }
  }

  asString(key: string): string | null {
    const value: string = this.props.get(key);
    if (value === null || value === undefined || typeof value !== 'string') {
      return null;
    }
    return value;
  }

  asStringArray(key: string): string[] | null {
    const value: string = this.props.get(key);
    if (value === null || value === undefined) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsedValue) ||
      (parsedValue as Array<string>).length === 0 ||
      typeof (parsedValue as Array<string>)[0] !== 'string'
    ) {
      return null;
    }
    return parsedValue as Array<string>;
  }

  load(): Promise<void> {
    return Promise.resolve(undefined);
  }

  properties(): Map<string, string> {
    return this.props;
  }

  propertyNames(): Set<string> {
    return new Set(this.props.keys());
  }

  refresh(): Promise<void> {
    this.props = this.props2;
    return Promise.resolve(undefined);
  }
}
