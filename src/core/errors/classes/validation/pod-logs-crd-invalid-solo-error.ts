// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the PodLogs CRD YAML fetched for the pinned Grafana Alloy version does not describe the
 * expected `podlogs.monitoring.grafana.com` CustomResourceDefinition. The message names the source URL and the
 * mismatch. The response reached solo but is not the pinned upstream manifest — usually a network intermediary
 * returning an error page or an unrelated file, occasionally an upstream repository move.
 */
export class PodLogsCrdInvalidSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(sourceUrl: string, reason: string, cause?: Error) {
    super(
      {
        message: `PodLogs CRD downloaded from ${sourceUrl} is not the expected manifest: ${reason}`,
        code: ErrorCodeRegistry.POD_LOGS_CRD_INVALID,
        troubleshootingSteps:
          'Re-run the command; a transient upstream response usually clears on retry\n' +
          'Confirm that the pinned Grafana Alloy version still ships this CRD at grafana/alloy\n' +
          'If the failure keeps recurring, file an issue against grafana/alloy at the pinned version',
      },
      cause,
    );
  }
}
