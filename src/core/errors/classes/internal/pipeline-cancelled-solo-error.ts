// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown to a phase of a parallel orchestration pipeline when a different phase has
 * already failed. When solo deploys network components concurrently, the phases coordinate through
 * an event bus; if one phase throws, the orchestrator aborts the bus so the remaining phases that
 * are waiting on an upstream event stop immediately instead of blocking until their own timeout.
 * This error marks such a downstream cancellation — it is not the root cause. The real failure is
 * carried as this error's `cause` and is what solo reports to you; look there (and earlier in the
 * logs) for the phase that actually failed.
 */
export class PipelineCancelledSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(cause: Error) {
    super(
      {
        message: `Pipeline phase cancelled due to an earlier failure: ${cause.message}`,
        code: ErrorCodeRegistry.PIPELINE_CANCELLED,
        troubleshootingSteps:
          'This phase did not fail on its own — another phase failed first and the pipeline was aborted.\n' +
          'Look at the root cause reported above (and earlier in the logs) for the phase that actually failed.',
      },
      cause,
    );
  }
}
