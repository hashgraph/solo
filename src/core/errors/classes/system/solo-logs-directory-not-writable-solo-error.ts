// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot write to its log directory or to one of the log files inside it; the
 * message names the offending path and the underlying failure is wrapped in `cause`. solo opens
 * `solo.ndjson` and `solo.log` under its logs directory before running any command, so an unwritable path
 * there stops every invocation — including `solo --version`, which otherwise touches nothing. The usual
 * cause is a directory or log file left behind by an installation that ran as a different user, for example
 * an earlier `sudo npm install -g @hiero-ledger/solo`, which leaves the files owned by root.
 */
export class SoloLogsDirectoryNotWritableSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(logPath: string, cause?: Error) {
    super(
      {
        message:
          `Solo cannot write to its log destination: ${logPath}` + SoloLogsDirectoryNotWritableSoloError.detail(cause),
        code: ErrorCodeRegistry.SOLO_LOGS_DIRECTORY_NOT_WRITABLE,
        troubleshootingSteps:
          'Check who owns the path: ls -la ~/.solo ~/.solo/logs\n' +
          'Take ownership if it belongs to another user: sudo chown -R "$(id -u):$(id -g)" ~/.solo\n' +
          'Or delete the directory and let solo recreate it: rm -rf ~/.solo\n' +
          'Reinstall without sudo so no root-owned files are left behind: npm install -g @hiero-ledger/solo\n' +
          'Or point solo at a writable location instead: export SOLO_HOME=<writable directory>',
      },
      cause,
      {logPath},
    );
  }

  /**
   * Renders the underlying failure into the message so the errno is visible: `EACCES` is fixed by taking
   * ownership, while `EROFS` and `ENOSPC` need a different path or a freed disk, and the steps below only
   * address the first. This error is raised while the logger is being built, so it is reported without one
   * and the cause is never written anywhere else — leaving it off the message loses the errno entirely.
   *
   * The trailing `, <syscall> '<path>'` of a Node file system message is dropped, since the path is already
   * named above; a message in any other shape is kept whole.
   */
  private static detail(cause?: Error): string {
    return cause?.message ? `: ${cause.message.replace(/,\s\w+\s'.*'$/, '')}` : '';
  }
}
