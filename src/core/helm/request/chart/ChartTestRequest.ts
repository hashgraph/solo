// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';
import { TestChartOptions } from '../../model/test/TestChartOptions.js';

/**
 * A request to test a Helm chart.
 */
export class ChartTestRequest implements HelmRequest {
  constructor(
    private readonly releaseName: string,
    private readonly options: TestChartOptions
  ) {
    if (!releaseName) {
      throw new Error('releaseName must not be null');
    }
    if (!options) {
      throw new Error('options must not be null');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('test', this.releaseName);
    this.options.apply(builder);
  }
} 