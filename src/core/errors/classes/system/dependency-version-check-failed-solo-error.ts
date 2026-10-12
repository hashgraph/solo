// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot determine the installed version of a dependency; the message names the dependency
 * and, when present, wraps the underlying `cause` (otherwise it notes the tool may not be installed or on
 * `PATH`). solo checks tool versions to confirm they meet its requirements, so this means the version check
 * could not run or its output could not be parsed.
 */
export class DependencyVersionCheckFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(dependency: string, cause?: Error) {
    super(
      {
        message: cause
          ? `Failed to check ${dependency} version: ${cause.message}`
          : `Failed to check ${dependency} version — tool may not be installed or is not in PATH`,
        code: ErrorCodeRegistry.DEPENDENCY_VERSION_CHECK_FAILED,
        troubleshootingSteps:
          `Verify ${dependency} is installed and available in your PATH\n` +
          `Check the installation: which ${dependency}\n` +
          'Re-run the command; solo installs the dependencies it manages automatically',
      },
      cause,
    );
  }
}
