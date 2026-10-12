// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot install a managed dependency; the message names the executable and wraps the
 * underlying failure in `cause`. solo installs tools like kubectl, helm, and kind when they are missing, so
 * this means installation failed — for example the download failed, the archive was invalid, or the target
 * directory was not writable.
 */
export class DependencyInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(executableName: string, cause: Error) {
    super(
      {
        message: `Failed to install ${executableName}: ${cause.message}`,
        code: ErrorCodeRegistry.DEPENDENCY_INSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify network connectivity for downloading the dependency\n' +
          'Check available disk space\n' +
          'Re-run the command to retry the installation',
      },
      cause,
    );
  }
}
