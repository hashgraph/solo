// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the operator's Solo config file exists but cannot be read or parsed. The
 * file is absent for most users and its absence is not an error; reaching this means a file is
 * present and unusable, which must be reported rather than ignored — silently continuing would
 * leave an operator believing their configured settings had been applied.
 */
export class SubprocessConfigLoadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(configFilePath: string, cause?: Error) {
    super(
      {
        message: `Failed to read the Solo config file at ${configFilePath}`,
        code: ErrorCodeRegistry.SUBPROCESS_CONFIG_LOAD_FAILED,
        troubleshootingSteps:
          `Check that ${configFilePath} is valid YAML\n` +
          'Verify the file is readable by the current user\n' +
          'Remove the file to fall back to Solo defaults',
      },
      cause,
    );
  }
}
