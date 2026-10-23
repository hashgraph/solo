// SPDX-License-Identifier: Apache-2.0

import {type Deprecation} from '../types/deprecation.js';

/**
 * Every deprecated environment variable Solo still reads, mapped to its deprecation. Unlike flags, environment
 * variables have no single definition site (some are read directly through `getEnvironmentVariable()`, others
 * are generated from the config schema), so their deprecations are declared here. The
 * `DeprecationRegistry` lists them alongside flags and commands, and the `warnDeprecatedEnvironmentVariables`
 * middleware warns whenever one is set.
 */
export class DeprecatedEnvironmentVariables {
  /** Covers the variables that tune how Solo provisions the WRAPS proving key for the consensus node. */
  private static readonly WRAPS_PROVING_KEY: Deprecation = {
    since: '0.94.0',
    removalIssue: 6174,
    reason: 'Consensus node v0.79.0 and later embed the WRAPS proving parameters, so it has no effect on them.',
  };

  public static readonly ALL: ReadonlyMap<string, Deprecation> = new Map<string, Deprecation>([
    ['EXPERIMENTAL_COPY_WRAPS_LIB_IN_PARALLEL', DeprecatedEnvironmentVariables.WRAPS_PROVING_KEY],
    ['CHECK_WRAPS_DIRECTORY_MAX_ATTEMPTS', DeprecatedEnvironmentVariables.WRAPS_PROVING_KEY],
    ['CHECK_WRAPS_DIRECTORY_BACKOFF_MS', DeprecatedEnvironmentVariables.WRAPS_PROVING_KEY],
    ['SOLO_TSS_WRAPS_ARTIFACTS-FOLDER-NAME', DeprecatedEnvironmentVariables.WRAPS_PROVING_KEY],
    ['SOLO_TSS_WRAPS_DIRECTORY-NAME', DeprecatedEnvironmentVariables.WRAPS_PROVING_KEY],
    ['SOLO_TSS_WRAPS_ALLOWED-KEY-FILES', DeprecatedEnvironmentVariables.WRAPS_PROVING_KEY],
    ['SOLO_TSS_WRAPS_LIBRARY-DOWNLOAD-URL', DeprecatedEnvironmentVariables.WRAPS_PROVING_KEY],
    ['SOLO_TSS_WRAPS_LIBRARY_DOWNLOAD_URL', DeprecatedEnvironmentVariables.WRAPS_PROVING_KEY],
  ]);
}
