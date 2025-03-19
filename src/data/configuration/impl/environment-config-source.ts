// SPDX-License-Identifier: Apache-2.0

import {type StorageBackend} from '../../backend/api/storage-backend.js';
import {type ConfigSource} from '../spi/config-source.js';
import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';
import {EnvironmentStorageBackend} from '../../backend/impl/environment-storage-backend.js';
import {ConfigurationError} from '../api/configuration-error.js';

/**
 * A {@link ConfigSource} that reads configuration data from the environment.
 *
 * <p>
 * Strings are read verbatim from the environment variables.
 * Numbers and booleans are converted from strings using the JSON parser.
 * Objects, arrays of objects, and arrays of primitives are assumed to be stored as serialized JSON strings.
 */
export class EnvironmentConfigSource implements ConfigSource {
  public readonly backend: StorageBackend;

  /**
   * The data read from the environment.
   * @private
   */
  private readonly data: Map<string, string>;

  public constructor(public readonly prefix?: string) {
    this.backend = new EnvironmentStorageBackend(prefix);
    this.data = new Map<string, string>();
  }

  public get name(): string {
    return 'EnvironmentConfigSource';
  }

  public get ordinal(): number {
    return 100;
  }

  public asBoolean(key: string): boolean {
    return undefined;
  }

  public asNumber(key: string): number | null {
    return undefined;
  }

  public asObject<T>(cls: ClassConstructor<T>, key?: string): T {
    return undefined;
  }

  public asObjectArray<T extends Array<T>>(cls: ClassConstructor<T>, key?: string): T[] {
    return [];
  }

  public asString(key: string): string | null {
    return this.data.get(key) || null;
  }

  public asStringArray(key: string): string[] | null {
    return undefined;
  }

  public properties(): Map<string, string> {
    return new Map<string, string>(this.data);
  }

  public propertyNames(): Set<string> {
    return new Set(this.data.keys());
  }

  public async load(): Promise<void> {
    this.data.clear();

    const envVars: string[] = await this.backend.list();
    for (const k of envVars) {
      try {
        const va: Uint8Array = await this.backend.readBytes(k);
        this.data.set(k, Buffer.from(va).toString('utf-8'));
      } catch (e) {
        throw new ConfigurationError(`Failed to read environment variable: ${k}`, e);
      }
    }
  }
}
