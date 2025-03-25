// SPDX-License-Identifier: Apache-2.0

import {type StorageOperation} from './storage-operation.js';

/**
 * The storage backend implementations provide the logic to read and write configuration and other persistent data layer
 * elements to and from various storage mediums.
 *
 * The Data Layer API must provide the following minimal set of implementations:
 * <ul>
 *   <li>Local File System</li>
 *   <li>Kubernetes ConfigMap</li>
 *   <li>Kubernetes Secret (for future use)</li>
 *   <li>Environment Variables</li>
 * </ul>
 *
 * Storage backends should not attempt to interpret or validate the data being read or written, but should handle the
 * conversion of plain javascript objects to the underlying data format and vice versa.
 */
export interface StorageBackend {
  /**
   * List all keys in the storage backend. Not all storage backends support listing keys.
   *
   * @returns A list of keys in the storage backend.
   */
  list(): Promise<string[]>;

  /**
   * Reads the persisted data from the storage backend and marshals it into bytes.
   *
   * @param key - The key to use to read the data from the storage backend. The key is implementation specific and might
   *              be a file path, a config map name, or an environment variable prefix.
   * @returns The persisted data represented as a byte array.
   */
  readBytes(key: string): Promise<Buffer>;

  /**
   * Write the configuration data to the storage backend by marshalling the bytes into the underlying
   * persistent data format.
   *
   * @param key - The key to use to write the data to the storage backend. The key is implementation specific and might
   *              be a file path, a config map name, or an environment variable prefix.
   * @param data - The persistent data represented as a byte array.
   */
  writeBytes(key: string, data: Buffer): Promise<void>;

  /**
   * Deletes the persisted data from the storage backend. Not all storage backends support deletion.
   *
   * @param key - The key to use to delete the data from the storage backend. The key is implementation specific and might
   *              be a file path, a config map name, or an environment variable prefix.
   */
  delete(key: string): Promise<void>;

  /**
   * Checks if the storage backend supports the given operation.
   * Implementations must provide a valid definition which responds appropriately for the requested operation.
   *
   * @param op - The desired storage operation to check.
   * @returns True if the operation is supported, false otherwise.
   */
  isSupported(op: StorageOperation): boolean;
}
