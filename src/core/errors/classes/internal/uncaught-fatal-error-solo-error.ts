// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {type FatalErrorKind} from '../../fatal-error-kind.js';

/**
 * @description Thrown when solo traps an error that escaped every handler — either an `uncaughtException` or
 * an `unhandledRejection`; the message names which of the two fired along with the escaped error's own
 * message, and the escaped error is wrapped in `cause`. Reaching this point means a code path failed
 * without being handled where it occurred, which indicates a defect in solo rather than invalid user input.
 */
export class UncaughtFatalErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(kind: FatalErrorKind, cause?: Error) {
    const detail: string = cause?.message ? `: ${cause.message}` : '';
    super(
      {
        message: `Unhandled ${kind}${detail}`,
        code: ErrorCodeRegistry.UNCAUGHT_FATAL_ERROR,
        troubleshootingSteps: `This is an internal Solo error. File a bug report: ${SoloError.bugReportUrl}`,
      },
      cause,
      {kind},
    );
  }
}
