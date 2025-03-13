// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';

/**
 * A request to uninstall a Helm chart.
 */
export class ChartUninstallRequest implements HelmRequest {
  constructor(private readonly releaseName: string) {
    if (!releaseName) {
      throw new Error('releaseName must not be null');
    }
  }

  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('uninstall', this.releaseName);
  }
} 