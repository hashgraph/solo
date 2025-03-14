// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../../../src/data/configuration/spi/config-source.js';
import {type StorageBackend} from '../../../src/data/backend/api/storage-backend.js';
import {type ClassConstructor} from '../../../src/business/utils/class-constructor.type.js';
import {type Refreshable} from '../../../src/data/configuration/spi/refreshable.js';

export class SimpleConfigSourceFixture implements ConfigSource, Refreshable {
  public props2: Map<string, string> = new Map<string, string>();

  public constructor(
    public readonly name: string,
    public readonly ordinal: number,
    public readonly prefix: string,
    public readonly backend: StorageBackend,
    public props: Map<string, string> = new Map<string, string>(),
  ) {}

  asBoolean(key: string): boolean | null {
    return undefined;
  }

  asNumber(key: string): number | null {
    return undefined;
  }

  asObject<T>(cls: ClassConstructor<T>, key?: string): T {
    return undefined;
  }

  asObjectArray<T>(cls: ClassConstructor<T>, key?: string): T[] {
    return [];
  }

  asString(key: string): string | null {
    return undefined;
  }

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
