// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';

/**
 * The versions of the components that run (or will run) together in one deployment. A component that is absent
 * from the tuple is not deployed, and constraints that involve it are not evaluated.
 */
export type ComponentVersionTuple = Readonly<Partial<Record<ComponentTypes, string>>>;
