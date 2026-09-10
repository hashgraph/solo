// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';
import {type Chart} from '../../model/chart.js';

/**
 * A request to pull a Helm chart.
 */
export class ChartPullRequest implements HelmRequest {
  public constructor(
    private readonly chart: Chart,
    private readonly version: string,
    private readonly destinationDirectory: string,
    private readonly repositoryUrl?: string,
  ) {}

  public apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('pull').argument('version', this.version).argument('destination', this.destinationDirectory);

    // Classic (non-OCI) chart repositories are addressed by URL without a prior `helm repo add`.
    // OCI charts carry their registry in the positional reference, so no `--repo` is supplied.
    if (this.repositoryUrl) {
      builder.argument('repo', this.repositoryUrl);
    }

    builder.positional(this.chart.qualified());
  }
}
