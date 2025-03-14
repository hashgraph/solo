// SPDX-License-Identifier: Apache-2.0

import {type StorageBackend} from '../api/storage-backend.js';
import {StorageOperation} from '../api/storage-operation.js';
import {UnsupportedStorageOperationError} from '../api/unsupported-storage-operation-error.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {IllegalArgumentError} from '../../../core/errors/illegal-argument-error.js';

export class EnvironmentStorageBackend implements StorageBackend {
  public constructor(public readonly prefix?: string) {}

  isSupported(op: StorageOperation): boolean {
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
    return keys.filter(value => this.matchPrefix(value));
  }

  public async readBytes(key: string): Promise<Uint8Array> {
    if (!key || key.trim().length === 0) {
      throw new IllegalArgumentError('key must not be null, undefined, or empty');
    }

    let env: object = process.env;
    if (!env) {
      env = {};
    }

    const value = env[key];
    if (!value) {
      throw new StorageBackendError(`key not found: ${key}`);
    }

    return new Uint8Array(Buffer.from(value, 'utf-8'));
  }

  public async writeBytes(key: string, data: Uint8Array): Promise<void> {
    throw new UnsupportedStorageOperationError('writeBytes is not supported by the environment storage backend');
  }

  public async delete(key: string): Promise<void> {
    throw new UnsupportedStorageOperationError('delete is not supported by the environment storage backend');
  }

  private matchPrefix(key: string): boolean {
    if (!key) {
      return false;
    }

    let prefixFilter = this.prefix ? this.prefix.trim().toUpperCase().replace('.', '_') : null;

    if (prefixFilter && !prefixFilter.endsWith('_')) {
      prefixFilter = prefixFilter.concat('_');
    }

    return prefixFilter ? key.toUpperCase().startsWith(prefixFilter) : true;
  }
}
