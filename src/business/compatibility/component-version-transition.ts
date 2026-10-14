// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';

/**
 * Declares a version boundary that a running component cannot be upgraded across in place: moving from below
 * `boundaryVersion` to `boundaryVersion` or later requires redeploying the component instead.
 */
export interface ComponentVersionTransition {
  readonly component: ComponentTypes;

  /**
   * The first version on the far side of the boundary. A '-0' suffix places its pre-releases on the far side too.
   */
  readonly boundaryVersion: string;

  /**
   * Why the boundary cannot be crossed in place, shown to the user when an upgrade is rejected.
   */
  readonly reason: string;
}
