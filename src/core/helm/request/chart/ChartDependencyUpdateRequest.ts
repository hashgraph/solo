// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';

/**
 * A request to update the dependencies of a Helm chart.
 */
export class ChartDependencyUpdateRequest implements HelmRequest {
  constructor(private readonly chartName: string) {
    if (!chartName) {
      throw new Error('chartName must not be null');
    }
    if (chartName.trim() === '') {
      throw new Error('chartName must not be blank');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('dependency', 'update');
    builder.positional(this.chartName);
  }
} 