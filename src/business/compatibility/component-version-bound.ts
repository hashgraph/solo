// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';

/**
 * A component paired with the lowest version that satisfies one side of a compatibility rule.
 */
export interface ComponentVersionBound {
  readonly component: ComponentTypes;

  /**
   * Inclusive lower bound. A '-0' suffix makes pre-releases of that version (e.g. v0.79.0-alpha.1) satisfy it.
   */
  readonly minimumVersion: string;
}
