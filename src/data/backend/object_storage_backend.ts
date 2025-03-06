// SPDX-License-Identifier: Apache-2.0
import {type StorageBackend} from './storage_backend.js';

export interface ObjectStorageBackend extends StorageBackend {
  /**
   * Reads the persisted data from the storage backend and marshals it into a plain javascript object.
   *
   * @param key - The key to use to read the data from the storage backend. The key is implementation specific and might
   *              be a file path, a config map name, or an environment variable prefix.
   * @returns The persisted data represented as a plain javascript object.
   */
  readObject(key: string): Promise<object>;

  /**
   * Write the configuration data to the storage backend by marshalling the plain javascript object into the underlying
   * persistent data format.
   *
   * @param key - The key to use to write the data to the storage backend. The key is implementation specific and might
   *              be a file path, a config map name, or an environment variable prefix.
   * @param data - The persistent data represented as a plain javascript object.
   */
  writeObject(key: string, data: object): Promise<void>;
}
