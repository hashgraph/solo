// SPDX-License-Identifier: Apache-2.0

import {type Deprecation} from './deprecation.js';

/**
 * Deprecation metadata for a command flag.
 *
 * A flag can be deprecated in one of two ways:
 * - **outright** — omit {@link commands}; the flag is deprecated for every command that accepts it, and the
 *   warning is emitted whenever it is supplied.
 * - **scoped to specific commands** — list them in {@link commands}; the flag stays fully supported
 *   everywhere else, and neither the warning nor the `--help` marker appears outside that scope.
 */
export interface FlagDeprecation extends Deprecation {
  /**
   * Command paths the deprecation is limited to, e.g. `['relay node add']` or `['relay node']`. A path
   * matches the invoked command exactly or as an ancestor prefix, so `'relay node'` scopes the deprecation
   * to every operation beneath the `relay node` group. When omitted, the flag is deprecated outright.
   */
  commands?: string[];
}
