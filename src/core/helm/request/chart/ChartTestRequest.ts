// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';
import {type HelmRequest} from '../HelmRequest.js';
import {TestChartOptions} from '../../model/test/TestChartOptions.js';

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
    readonly options: TestChartOptions = TestChartOptions.defaults(),
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
