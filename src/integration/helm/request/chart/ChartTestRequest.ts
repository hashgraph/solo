// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';
import {type HelmRequest} from '../HelmRequest.js';
import {type TestChartOptions} from '../../model/test/TestChartOptions.js';
import {TestChartOptionsBuilder} from '../../model/test/TestChartOptionsBuilder.js';

/**
 * A request to test a Helm chart.
 */
export class ChartTestRequest implements HelmRequest {
  /**
   * Creates a new test request with the given release name and options.
   *
   * @param releaseName The name of the release.
   * @param options The options to use when testing the chart.
   */
  constructor(
    readonly releaseName: string,
    readonly options: TestChartOptions = TestChartOptionsBuilder.builder().build(),
  ) {
    if (!releaseName) {
      throw new Error('releaseName must not be null');
    }
    if (releaseName.trim() === '') {
      throw new Error('releaseName must not be null or blank');
    }
    if (!options) {
      throw new Error('options must not be null');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('test');
    this.options.apply(builder);
    builder.positional(this.releaseName);
  }
}
