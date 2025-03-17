// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';
import {type HelmRequest} from '../HelmRequest.js';
import {type Chart} from '../../model/Chart.js';
import {InstallChartOptions} from '../../model/install/InstallChartOptions.js';

/**
 * A request to install a Helm chart.
 */
export class ChartInstallRequest implements HelmRequest {
  /**
   * Creates a new install request with the given chart and options.
   *
   * @param releaseName The name of the release.
   * @param chart The chart to install.
   * @param options The options to use when installing the chart.
   */
  constructor(
    readonly releaseName: string,
    readonly chart: Chart,
    readonly options: InstallChartOptions = InstallChartOptions.defaults(),
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

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('install');
    this.options.apply(builder);

    const chartName =
      this.options.repo && this.options.repo.trim() !== '' ? this.chart.unqualified() : this.chart.qualified();

    builder.positional(this.releaseName).positional(chartName);
  }
}
