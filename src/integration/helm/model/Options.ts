// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../execution/HelmExecutionBuilder.js';

/**
 * Interface for options that can be applied to Helm commands.
 */
export interface Options {
  apply(builder: HelmExecutionBuilder): void;
}
