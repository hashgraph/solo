// SPDX-License-Identifier: Apache-2.0

/**
 * Indicates a configuration source that can be refreshed.
 */
export interface Refreshable {
  /**
   * Reloads the configuration source from the underlying storage backend.
   */
  refresh(): Promise<void>;
}
