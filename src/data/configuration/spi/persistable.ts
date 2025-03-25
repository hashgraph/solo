// SPDX-License-Identifier: Apache-2.0

/**
 * Indicates a configuration source that can be persisted.
 */
export interface Persistable {
  /**
   * Persists the configuration source to the underlying storage backend.
   */
  persist(): Promise<void>;
}
