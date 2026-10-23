// SPDX-License-Identifier: Apache-2.0

import {type ComponentVersionConstraint} from './component-version-constraint.js';

/**
 * A constraint that a component version tuple does not satisfy, together with the versions that broke it.
 */
export interface ComponentCompatibilityViolation {
  readonly constraint: ComponentVersionConstraint;

  /**
   * The version of `constraint.when.component` that made the constraint apply.
   */
  readonly whenVersion: string;

  /**
   * The version of `constraint.requires.component` that is below the required minimum.
   */
  readonly requiresVersion: string;
}
