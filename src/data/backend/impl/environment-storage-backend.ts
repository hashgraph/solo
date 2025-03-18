// SPDX-License-Identifier: Apache-2.0

import {type StorageBackend} from '../api/storage-backend.js';
import {StorageOperation} from '../api/storage-operation.js';
import {UnsupportedStorageOperationError} from '../api/unsupported-storage-operation-error.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {IllegalArgumentError} from '../../../core/errors/illegal-argument-error.js';
import {Regex} from '../../../business/utils/regex.js';

export class EnvironmentStorageBackend implements StorageBackend {
  public constructor(public readonly prefix?: string) {}

  public isSupported(op: StorageOperation): boolean {
    switch (op) {
      case StorageOperation.List:
      case StorageOperation.ReadBytes:
        return true;
      default:
        return false;
    }
  }

  public async list(): Promise<string[]> {
    let env: object = process.env;
    if (!env) {
      env = {};
    }

    const keys = Object.keys(env);
    return keys.filter(value => this.matchPrefix(value)).map(value => this.envKeyToConfigKey(value));
  }

  public async readBytes(key: string): Promise<Uint8Array> {
    if (!key || key.trim().length === 0) {
      throw new IllegalArgumentError('key must not be null, undefined, or empty');
    }

    const normalizedKey = this.configKeyToEnvKey(key);
    let env: object = process.env;
    if (!env) {
      env = {};
    }

    const value = env[normalizedKey];
    if (!value) {
      throw new StorageBackendError(`key not found: ${key}`);
    }

    return new Uint8Array(Buffer.from(value, 'utf-8'));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars,unused-imports/no-unused-vars
  public async writeBytes(key: string, data: Uint8Array): Promise<void> {
    throw new UnsupportedStorageOperationError('writeBytes is not supported by the environment storage backend');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars,unused-imports/no-unused-vars
  public async delete(key: string): Promise<void> {
    throw new UnsupportedStorageOperationError('delete is not supported by the environment storage backend');
  }

  private matchPrefix(key: string): boolean {
    if (!key) {
      return false;
    }

    let prefixFilter = this.prefix ? this.envKeyFormat(this.prefix) : null;

    if (prefixFilter && !prefixFilter.endsWith('_')) {
      prefixFilter = prefixFilter.concat('_');
    }

    return prefixFilter ? this.envKeyFormat(key).startsWith(prefixFilter) : true;
  }

  private envKeyFormat(val: string): string {
    if (!val || val.trim().length === 0) {
      return val;
    }

    return val.trim().toUpperCase().replace('.', '_');
  }

  private configKeyFormat(val: string): string {
    if (!val || val.trim().length === 0) {
      return val;
    }

    return val.trim().toLowerCase().replace('_', '.');
  }

  private configKeyToEnvKey(key: string): string {
    return this.envKeyFormat(this.addPrefix(key));
  }

  private envKeyToConfigKey(key: string): string {
    return this.stripPrefix(this.configKeyFormat(key));
  }

  private addPrefix(key: string): string {
    let prefix: string = this.prefix ? this.configKeyFormat(this.prefix) : null;
    prefix = prefix && !prefix.endsWith('.') ? `${prefix}.` : prefix;
    const normalizedKey: string = this.configKeyFormat(key);
    return prefix && !normalizedKey.startsWith(prefix) ? `${prefix}${normalizedKey}` : normalizedKey;
  }

  private stripPrefix(key: string): string {
    const normalizedKey: string = this.configKeyFormat(key);
    let prefix: string = this.prefix ? this.configKeyFormat(this.prefix) : null;
    prefix = !prefix.endsWith('.') ? `${prefix}.` : prefix;
    return prefix && normalizedKey.startsWith(prefix)
      ? normalizedKey.replace(`^${Regex.escape(prefix)}`, '')
      : normalizedKey;
  }
}
