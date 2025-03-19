// SPDX-License-Identifier: Apache-2.0

import {type StorageBackend} from '../api/storage-backend.js';
import {StorageOperation} from '../api/storage-operation.js';
import {UnsupportedStorageOperationError} from '../api/unsupported-storage-operation-error.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {IllegalArgumentError} from '../../../core/errors/illegal-argument-error.js';
import {Prefix} from '../../key/prefix.js';
import {EnvironmentKeyFormatter} from '../../key/environment-key-formatter.js';

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

  /**
   * Let prefix = SOLO
   * Let separator = _
   *
   * Given:
   *  env = SOLO_CACHE_DIR=/tmp
   *  cfg = solo.cache.dir=/tmp
   * Then:
   *  key = cache.dir
   *  rnode = cache
   *  lnode = dir
   *  ltype = string
   *  value = /tmp
   *
   * Given:
   *  env = SOLO_DEPLOYMENTS_0_NAME=deployment1
   *  cfg = solo.deployments.0.name=deployment1
   * Then:
   *  key = deployments.0.name
   *  rnode = deployments
   *  inode = 0
   *  itype = array<object>
   *  lnode = name
   *  ltype = string
   *
   *  Given:
   *  env = SOLO_DEPLOYMENTS_0_CLUSTERS_0=e2e-cluster-1
   *  cfg = solo.deployments.0.clusters.0=e2e-cluster-1
   * Then:
   *  key = deployments.0.clusters.0
   *  rnode = deployments
   *  rtype = array
   *  lnode = clusters
   *  ltype = array<string>
   */

  public async list(): Promise<string[]> {
    let env: object = process.env;
    if (!env) {
      env = {};
    }

    const keys = Object.keys(env);
    return keys
      .filter(value => Prefix.matcher(value, undefined, EnvironmentKeyFormatter.instance()))
      .map(value => Prefix.strip(value, this.prefix));
  }

  public async readBytes(key: string): Promise<Uint8Array> {
    if (!key || key.trim().length === 0) {
      throw new IllegalArgumentError('key must not be null, undefined, or empty');
    }

    const normalizedKey = Prefix.add(key, this.prefix, EnvironmentKeyFormatter.instance());
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
}
