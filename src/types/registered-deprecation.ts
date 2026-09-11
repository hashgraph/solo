// SPDX-License-Identifier: Apache-2.0

import {type Deprecation} from './deprecation.js';

/**
 * A deprecation entry collected by the {@link DeprecationRegistry}, pairing the deprecated feature's
 * human-readable identifier and kind with its structured {@link Deprecation} metadata.
 */
export interface RegisteredDeprecation {
  /** Identifier of the deprecated feature, e.g. `--release-tag` or `deployment refresh port-forwards`. */
  feature: string;

  /** Whether the deprecated feature is a flag, a command group, or a leaf subcommand. */
  kind: 'flag' | 'command' | 'subcommand';

  /** The structured deprecation metadata. */
  deprecation: Deprecation;
}
