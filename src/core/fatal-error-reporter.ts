// SPDX-License-Identifier: Apache-2.0

import {type SoloLogger} from './logging/solo-logger.js';
import {type SoloError} from './errors/solo-error.js';
import {type FatalErrorKind} from './errors/fatal-error-kind.js';
import {SoloErrors} from './errors/solo-errors.js';

/**
 * Reports errors that escaped every handler (`uncaughtException` and `unhandledRejection`).
 *
 * Reporting means logging, and logging is itself a thing that can be broken: when the log destination
 * cannot be written, every write raises a fresh error that lands straight back here, and reporting it
 * raises another. Reporting is therefore bounded — the first few failures render normally and every later
 * one goes to stderr — so a failing logger cannot drive an unbounded report loop.
 */
export class FatalErrorReporter {
  /**
   * How many escaped errors are rendered in full before the rest are reduced to a stderr line.
   *
   * Bounded rather than latched at one: a long run can hit genuinely distinct fatal errors, and reducing
   * the second one to a bare message loses its code and remediation even when the logger is healthy. The
   * bound still cuts the loop, because a broken logger produces far more than this many in a row.
   */
  private static readonly MAX_RENDERED_REPORTS: number = 3;

  private static renderedReports: number = 0;

  /**
   * Renders the first escaped error through the logger and routes any subsequent one to stderr.
   * Always marks the process as failed so a caller cannot mistake this for a successful run.
   *
   * @param logger - the logger to render the first failure through
   * @param kind - which handler fired: `uncaughtException` or `unhandledRejection`
   * @param escapedError - the value the handler received; normalized to an `Error` when it is not one
   */
  public static report(logger: SoloLogger, kind: FatalErrorKind, escapedError: unknown): void {
    process.exitCode = 1;

    const cause: Error | undefined = FatalErrorReporter.normalize(escapedError);

    if (FatalErrorReporter.renderedReports >= FatalErrorReporter.MAX_RENDERED_REPORTS) {
      FatalErrorReporter.writeToStandardError(kind, cause);
      return;
    }
    FatalErrorReporter.renderedReports += 1;

    try {
      logger.showUserError(new SoloErrors.internal.uncaughtFatalError(kind, cause));
    } catch {
      // The logger is the failing component, so stderr is the only reporting path left.
      FatalErrorReporter.writeToStandardError(kind, cause);
    }
  }

  /**
   * Renders a coded error to stderr without a logger.
   *
   * Failures raised while building the logger have no logger to render through — and an unwritable log
   * destination is exactly such a failure — so the code, message, remediation and documentation link are
   * written directly instead of dumping a raw stack the user cannot act on.
   */
  public static reportWithoutLogger(error: SoloError): void {
    process.exitCode = 1;
    FatalErrorReporter.renderToStandardError(error);
  }

  /**
   * Writes a coded error to stderr without touching the exit code.
   *
   * Used for failures the CLI recovers from — an unusable log destination degrades Solo to console-only
   * logging rather than stopping the command — where the user still needs the code and remediation.
   */
  public static renderToStandardError(error: SoloError, heading: string = 'ERROR'): void {
    const code: string | undefined = error.getFormattedCode();
    process.stderr.write(`\n${heading} ${code ? `[${code}] ` : ''}${error.message}\n`);

    for (const step of error.getTroubleshootingSteps() ?? []) {
      process.stderr.write(`  -> ${step}\n`);
    }

    const documentUrl: string | undefined = error.getDocumentUrl();
    if (documentUrl) {
      process.stderr.write(`\nLearn more: ${documentUrl}\n`);
    }
  }

  /** Clears the report count. Exposed for tests, which need each case to observe a fresh process. */
  public static reset(): void {
    FatalErrorReporter.renderedReports = 0;
  }

  private static normalize(escapedError: unknown): Error | undefined {
    if (escapedError === undefined || escapedError === null) {
      return undefined;
    }
    return escapedError instanceof Error ? escapedError : new Error(String(escapedError));
  }

  private static writeToStandardError(kind: FatalErrorKind, cause?: Error): void {
    process.stderr.write(`solo: unhandled ${kind}: ${cause?.message ?? 'unknown error'}\n`);
  }
}
