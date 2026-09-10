// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `helm pull` completes without error but no new chart tarball appears in
 * the cache charts directory; the message names the chart and version that were being cached. solo
 * identifies the pulled archive by diffing the directory contents before and after the pull, so an
 * empty diff means Helm reported success without producing the expected `.tgz` — for example due to
 * an unexpected Helm CLI behaviour change or a filesystem issue in the cache directory.
 */
export class HelmChartPullNoArchiveSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(chartDescriptor: string) {
    super({
      message: `helm pull did not produce a chart archive for ${chartDescriptor}`,
      code: ErrorCodeRegistry.HELM_CHART_PULL_NO_ARCHIVE,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify the Helm CLI works: helm version\n' +
        'Try pulling the chart manually: helm pull <chart> --version <version>',
    });
  }
}
