// SPDX-License-Identifier: Apache-2.0

import {type ComponentVersionBound} from './component-version-bound.js';

/**
 * Declares that once one component reaches a version, another component deployed alongside it must be at least a
 * given version. A matched pair (both sides of a boundary must agree) is two constraints, one in each direction.
 */
export interface ComponentVersionConstraint {
  /**
   * The constraint applies when this component is at or above its minimum version.
   */
  readonly when: ComponentVersionBound;

  /**
   * The component that must then be at or above its minimum version.
   */
  readonly requires: ComponentVersionBound;

  /**
   * Why the constraint exists, shown to the user when it is violated.
   */
  readonly reason: string;
}
