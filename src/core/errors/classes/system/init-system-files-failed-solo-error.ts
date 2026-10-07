// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot initialize its system files; the underlying failure is wrapped in `cause`. solo
 * lays down the files it needs under its home directory during initialization, so this means that step
 * failed — for example the directory was not writable or a file could not be created.
 */
export class InitSystemFilesFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to initialize Solo system files: ${cause.message}`,
        code: ErrorCodeRegistry.INIT_SYSTEM_FILES_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify write permissions for the Solo home directory (~/.solo)\n' +
          'Check available disk space\n' +
          'Re-run the command; solo sets up its system files at the start of every command',
      },
      cause,
    );
  }
}
