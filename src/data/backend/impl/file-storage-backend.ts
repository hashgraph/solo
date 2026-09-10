// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../core/errors/solo-errors.js';
import {type StorageBackend} from '../api/storage-backend.js';
import {StorageOperation} from '../api/storage-operation.js';
import {type Stats, lstatSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {StorageBackendError} from '../api/storage-backend-error.js';
import {readFileSync} from 'node:fs';
import {PathEx} from '../../../business/utils/path-ex.js';

/**
 * A file storage backend that operates on files within a specified base path. This backend does not support recursive
 * operations into subfolders and only operates on files contained within the specified base path. All directory entries
 * are ignored.
 */
export class FileStorageBackend implements StorageBackend {
  /**
   * Creates a new file storage backend bound to the specified base path. The basic file storage backend does not support
   * recursive operations into subfolders and only operates on files contained within the specified base path.
   * All directory entries are ignored.
   *
   * @param basePath - The base path to use for all file operations.
   * @throws IllegalArgumentError if the base path is null, undefined, or empty.
   * @throws StorageBackendError if the base path does not exist or is not a directory.
   */
  public constructor(public readonly basePath: string) {
    if (!basePath || basePath.trim().length === 0) {
      throw new SoloErrors.validation.illegalArgument('basePath must not be null, undefined or empty');
    }

    let stats: Stats;
    try {
      stats = lstatSync(basePath);
    } catch (error) {
      throw new StorageBackendError('basePath must exist and be valid', error);
    }

    if (!stats || !stats.isDirectory()) {
      throw new StorageBackendError(`basePath must be a valid directory: ${basePath}`);
    }
  }

  public isSupported(op: StorageOperation): boolean {
    switch (op) {
      case StorageOperation.List:
      case StorageOperation.ReadBytes:
      case StorageOperation.WriteBytes:
      case StorageOperation.Delete: {
        return true;
      }
      default: {
        return false;
      }
    }
  }

  public async list(): Promise<string[]> {
    try {
      const entries: string[] = readdirSync(this.basePath, {encoding: 'utf8', recursive: false});

      if (entries.length === 0) {
        return [];
      }

      return entries.filter((item): boolean => statSync(PathEx.join(this.basePath, item))?.isFile());
    } catch (error) {
      throw new StorageBackendError('Error listing files in base path', error);
    }
  }

  public async readBytes(key: string): Promise<Buffer> {
    if (!key || key.trim().length === 0) {
      throw new SoloErrors.validation.illegalArgument('key must not be null, undefined or empty');
    }

    const filePath: string = PathEx.join(this.basePath, key);
    try {
      return readFileSync(filePath);
    } catch (error) {
      throw new StorageBackendError(`error reading file: ${filePath}`, error);
    }
  }

  public async writeBytes(key: string, data: Buffer): Promise<void> {
    if (!key || key.trim().length === 0) {
      throw new SoloErrors.validation.illegalArgument('key must not be null, undefined or empty');
    }

    if (!data) {
      throw new SoloErrors.validation.illegalArgument('data must not be null or undefined');
    }

    const filePath: string = PathEx.join(this.basePath, key);
    const temporaryFilePath: string = this.getTemporaryFilePath(filePath);
    try {
      writeFileSync(temporaryFilePath, data, {flag: 'wx'});
      renameSync(temporaryFilePath, filePath);
    } catch (error) {
      try {
        unlinkSync(temporaryFilePath);
      } catch {
        // best-effort: the temporary file may not exist yet or may already be cleaned up
      }
      throw new StorageBackendError(`error writing file: ${filePath}`, error);
    }
  }

  private getTemporaryFilePath(filePath: string): string {
    const directoryPath: string = PathEx.dirname(filePath);
    const fileName: string = PathEx.basename(filePath);
    const uniqueSuffix: string = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return PathEx.join(directoryPath, `.${fileName}.solo-write-${uniqueSuffix}.tmp`);
  }

  public async delete(key: string): Promise<void> {
    if (!key || key.trim().length === 0) {
      throw new SoloErrors.validation.illegalArgument('key must not be null, undefined or empty');
    }

    const filePath: string = PathEx.join(this.basePath, key);
    let stats: Stats;
    try {
      stats = statSync(filePath);
    } catch (error) {
      throw new StorageBackendError(`file not found or is not readable: ${filePath}`, error);
    }

    if (!stats) {
      throw new StorageBackendError(`file not found: ${filePath}`);
    }

    if (!stats.isFile()) {
      throw new StorageBackendError(`path is not a file: ${filePath}`);
    }

    try {
      unlinkSync(filePath);
    } catch (error) {
      throw new StorageBackendError(`error deleting file: ${filePath}`, error);
    }
  }
}
