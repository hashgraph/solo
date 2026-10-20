// SPDX-License-Identifier: Apache-2.0

import {type Deprecation} from './deprecation.js';

/**
 * A deprecation entry collected by the {@link DeprecationRegistry}, pairing the deprecated feature's
 * human-readable identifier and kind with its structured {@link Deprecation} metadata.
 */
export interface RegisteredDeprecation {
  /**
   * Identifier of the deprecated feature, e.g. `--relay-release`, `deployment refresh port-forwards`, or
   * `EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL`.
   */
  feature: string;

  /** Whether the deprecated feature is a flag, a command group, a leaf subcommand, or an environment variable. */
  kind: 'flag' | 'command' | 'subcommand' | 'environment-variable';

  /** The structured deprecation metadata. */
  deprecation: Deprecation;
}
