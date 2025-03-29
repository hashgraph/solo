// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';
import {type Chart} from '../../model/chart.js';
import {type UpgradeChartOptions} from '../../model/upgrade/upgrade-chart-options.js';
import {UpgradeChartOptionsBuilder} from '../../model/upgrade/upgrade-chart-options-builder.js';

/**
 * A request to upgrade a Helm chart.
 */
export class ChartUpgradeRequest implements HelmRequest {
  /**
   * Creates a new upgrade request with the given chart and options.
   *
   * @param releaseName The name of the release to upgrade.
   * @param chart The chart to upgrade to.
   * @param options The options to use when upgrading the chart.
   */
  constructor(
    readonly releaseName: string,
    readonly chart: Chart,
    readonly options: UpgradeChartOptions = UpgradeChartOptionsBuilder.builder().build(),
  ) {
    if (!releaseName) {
      throw new Error('releaseName must not be null');
    }
    if (releaseName.trim() === '') {
      throw new Error('releaseName must not be blank');
    }
    if (!chart) {
      throw new Error('chart must not be null');
    }
    if (!options) {
      throw new Error('options must not be null');
    }
  }

  /**
   * Applies this request to the given builder.
   * @param builder The builder to apply the request to.
   */
  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('upgrade');
    this.options.apply(builder);

    builder.positional(this.releaseName).positional(this.chart.qualified());
  }
}
