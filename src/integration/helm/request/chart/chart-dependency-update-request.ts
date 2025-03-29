// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request to update the dependencies of a Helm chart.
 */
export class ChartDependencyUpdateRequest implements HelmRequest {
  constructor(readonly chartName: string) {
    if (!chartName) {
      throw new Error('chartName must not be null');
    }
    if (chartName.trim() === '') {
      throw new Error('chartName must not be blank');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('dependency', 'update').positional(this.chartName);
  }
}
