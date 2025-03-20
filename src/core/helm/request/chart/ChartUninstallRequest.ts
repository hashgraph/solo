// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/HelmExecutionBuilder.js';
import {type HelmRequest} from '../HelmRequest.js';
import {type UnInstallChartOptions} from '../../model/install/UnInstallChartOptions.js';

/**
 * A request to uninstall a Helm chart.
 */
export class ChartUninstallRequest implements HelmRequest {
  constructor(
    private readonly releaseName: string,
    private readonly options: UnInstallChartOptions,
  ) {
    if (!releaseName) {
      throw new Error('releaseName must not be null');
    }
    if (releaseName.trim() === '') {
      throw new Error('releaseName must not be null or blank');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('uninstall');

    // Apply options if provided
    if (this.options) {
      this.options.apply(builder);
    }
    builder.positional(this.releaseName);
  }
}
