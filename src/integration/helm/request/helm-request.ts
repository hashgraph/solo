// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../execution/helm-execution-builder.js';

/**
 * Interface for Helm request parameters that can be applied to a HelmExecutionBuilder.
 */
export interface HelmRequest {
  /**
   * Applies this request's parameters to the given builder.
   * @param builder The builder to apply the parameters to
   */
  apply(builder: HelmExecutionBuilder): void;
}
