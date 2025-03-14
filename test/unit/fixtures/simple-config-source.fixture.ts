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

  // TODO move to abstract class?
  asBoolean(key: string): boolean | null {
    const value = this.props.get(key);
    if (value === null || value === undefined) {
      return null;
    }
    return value.toLowerCase() === 'true';
  }

  // TODO move to abstract class?
  asNumber(key: string): number | null {
    const value = this.props.get(key);
    if (value === null || value === undefined) {
      return null;
    }
    return Number(value);
  }

  // TODO move to abstract class?
  asObject<T>(cls: ClassConstructor<T>, key?: string): T {
    return undefined;
  }

  // TODO move to abstract class?
  asObjectArray<T>(cls: ClassConstructor<T>, key?: string): T[] {
    return [];
  }

  // TODO move to abstract class?
  asString(key: string): string | null {
    const value = this.props.get(key);
    if (value === null || value === undefined) {
      return null;
    }
    return value;
  }

  // TODO move to abstract class?
  asStringArray(key: string): string[] | null {
    return undefined;
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
