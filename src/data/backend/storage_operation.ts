// SPDX-License-Identifier: Apache-2.0

/**
 * Defines the optional operations that can be performed on storage backends.
 * Used the `StorageBackend` interface `isSupported` method.
 */
export enum StorageOperation {
  List = 'list',
  ReadObject = 'readObject',
  WriteObject = 'writeObject',
  ReadBytes = ' readBytes',
  WriteBytes = 'writeBytes',
  Delete = 'delete',
}
