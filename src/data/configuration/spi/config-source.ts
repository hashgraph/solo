// SPDX-License-Identifier: Apache-2.0

import {type StorageBackend} from '../../backend/api/storage-backend.js';
import {type ConfigAccessor} from './config-accessor.js';

/**
 * A configuration source defines the methods for reading configuration data from a configuration source.
 * {@link ConfigSource} instances provide read-only access to configuration data.
 *
 * Represents a configuration file from a file system storage backend, the contents of the shell environment, the
 * contents of a key within a configuration map, or the contents of a key with a secret.
 */
export interface ConfigSource extends ConfigAccessor {
  /**
   * The name of the configuration source.
   */
  readonly name: string;

  /**
   * The ordinal of the configuration source.
   */
  readonly ordinal: number;

  /**
   * The prefix that is used to filter configuration
   * keys that are read from the configuration source.
   */
  readonly prefix?: string;

  /**
   * The backend that is used to read and write configuration data.
   */
  readonly backend: StorageBackend;

  /**
   * Loads the configuration data from the configuration source.
   */
  load(): Promise<void>;
}
