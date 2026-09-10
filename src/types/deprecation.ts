// SPDX-License-Identifier: Apache-2.0

import {type Version} from './index.js';

/**
 * Structured metadata describing a deprecated command, subcommand, or flag.
 *
 * A single value of this shape drives every deprecation behavior: the user-facing warning printed when
 * the feature is used, the marker rendered into `--help` (and therefore the generated docs), and the
 * build-time reminder that surfaces features which are past their removal target.
 */
export interface Deprecation {
  /**
   * The version that introduces the deprecation. By convention this is the *next* Solo release at the time
   * the deprecation is added (deprecating a feature does not remove it, so it takes effect from the next
   * published version).
   */
  since: Version;

  /**
   * Mandatory GitHub issue number tracking the eventual removal of the deprecated feature. Requiring this
   * field means a feature cannot be deprecated without an owned, trackable work item for its removal.
   */
  removalIssue: number;

  /** Optional replacement to point users at, e.g. `--relay-version` or `deployment port-forwards refresh`. */
  replacement?: string;

  /** Optional free-text explanation of why the feature is being deprecated. */
  reason?: string;

  /**
   * Optional explicit removal target. When omitted it defaults to {@link since} advanced by
   * {@link Deprecations.DEFAULT_REMOVAL_WINDOW} minor versions. The target is advisory, not enforced: a
   * feature may be kept longer by updating the tracking issue.
   */
  removeBy?: Version;
}
