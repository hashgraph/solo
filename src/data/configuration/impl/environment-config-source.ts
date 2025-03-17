// SPDX-License-Identifier: Apache-2.0

import {type StorageBackend} from '../../backend/api/storage-backend.js';
import {type ConfigSource} from '../spi/config-source.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';
import {EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';
import {ConfigurationError} from '../api/configuration-error.js';

export class EnvironmentConfigSource implements ConfigSource {
  public readonly backend: StorageBackend;

  private readonly data: Map<string, string>;

  public constructor(public readonly prefix?: string) {
    this.backend = new EnvironmentStorageBackend(prefix);
    this.data = new Map<string, string>();
  }

  get name(): string {
    return 'EnvironmentConfigSource';
  }

  get ordinal(): number {
    return 100;
  }

  public asBoolean(key: string): boolean {
    return undefined;
  }

  asNumber(key: string): number | null {
    return undefined;
  }

  asObject<T>(cls: ClassConstructor<T>, key?: string): T {
    return undefined;
  }

  asObjectArray<T extends Array<T>>(cls: ClassConstructor<T>, key?: string): T[] {
    return [];
  }

  asString(key: string): string | null {
    return undefined;
  }

  asStringArray(key: string): string[] | null {
    return undefined;
  }

  public async load(): Promise<void> {
    this.data.clear();

    const envVars: string[] = await this.backend.list();
    for (const k of envVars) {
      try {
        const va: Uint8Array = await this.backend.readBytes(k);
        this.data.set(k, va.toString());
      } catch (e) {
        throw new ConfigurationError(`Failed to read environment variable: ${k}`, e);
      }
    }
  }

  properties(): Map<string, string> {
    return undefined;
  }

  propertyNames(): Set<string> {
    return undefined;
  }
}
