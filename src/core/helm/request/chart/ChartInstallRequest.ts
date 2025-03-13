// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';
import { Chart } from '../../model/Chart.js';
import { InstallChartOptions } from '../../model/install/InstallChartOptions.js';

/**
 * A request to install a Helm chart.
 */
export class ChartInstallRequest implements HelmRequest {
  constructor(
    private readonly releaseName: string,
    private readonly chart: Chart,
    private readonly options?: InstallChartOptions
  ) {
    if (!releaseName) {
      throw new Error('releaseName must not be null');
    }
    if (!chart) {
      throw new Error('chart must not be null');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('install', this.releaseName, this.chart.name);
    if (this.options) {
      this.options.apply(builder);
    }
  }
} 