// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../core/errors/solo-errors.js';
import {type StorageBackend} from '../api/storage-backend.js';
import {StorageOperation} from '../api/storage-operation.js';
import {UnsupportedStorageOperationError} from '../api/unsupported-storage-operation-error.js';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {Prefix} from '../../key/prefix.js';
import {EnvironmentKeyFormatter} from '../../key/environment-key-formatter.js';
import {StringEx} from '../../../business/utils/string-ex.js';

export class EnvironmentStorageBackend implements StorageBackend {
  public constructor(public readonly prefix?: string) {}

  public isSupported(op: StorageOperation): boolean {
    switch (op) {
      case StorageOperation.List:
      case StorageOperation.ReadBytes: {
        return true;
      }
      default: {
        return false;
      }
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
    let environment: object = process.env;
    if (!environment) {
      environment = {};
    }

    const keys: string[] = Object.keys(environment);
    return keys
      .filter((value): boolean => Prefix.matcher(value, this.prefix, EnvironmentKeyFormatter.instance()))
      .map((value): string => Prefix.strip(value, this.prefix));
  }

  public async readBytes(key: string): Promise<Buffer> {
    if (StringEx.isEmpty(key)) {
      throw new SoloErrors.validation.illegalArgument('key must not be null, undefined, or empty');
    }

    const normalizedKey: string = Prefix.add(key, this.prefix, EnvironmentKeyFormatter.instance());
    let environment: NodeJS.ProcessEnv = process.env;
    if (!environment) {
      environment = {};
    }

    const value: string = environment[normalizedKey];
    if (!value) {
      throw new StorageBackendError(`key not found: ${key}`);
    }

    return Buffer.from(value, 'utf8');
  }

  /**
   * Reads a fixed/legacy environment variable by its exact name,
   * without applying the `SOLO_` prefix or key formatting.
   * Returns undefined when the variable is missing or blank.
   * Used to resolve environment variable aliases.
   */
  public readRawValue(name: string): string | undefined {
    let environment: NodeJS.ProcessEnv = process.env;
    if (!environment) {
      environment = {};
    }

    const value: string | undefined = environment[name];
    return value && value.trim() !== '' ? value : undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async writeBytes(_key: string, _data: Buffer): Promise<void> {
    throw new UnsupportedStorageOperationError('writeBytes is not supported by the environment storage backend');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async delete(_key: string): Promise<void> {
    throw new UnsupportedStorageOperationError('delete is not supported by the environment storage backend');
  }
}
