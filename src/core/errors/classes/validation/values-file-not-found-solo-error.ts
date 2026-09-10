// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the values file supplied to `--values-file` does not exist. solo reads this YAML file to
 * populate per-component configuration before deploying, so this means the path is missing or wrong — for
 * example a typo in the file name or a relative path resolved from an unexpected directory.
 */
export class ValuesFileNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(valuesFilePath: string) {
    super({
      message: `Values file does not exist: ${valuesFilePath}`,
      code: ErrorCodeRegistry.VALUES_FILE_NOT_FOUND,
      troubleshootingSteps:
        `Verify the file exists: ls -la ${valuesFilePath}\n` +
        'Check the path passed to --values-file for typos and for the correct file extension (.yaml)\n' +
        'Relative paths are resolved against the current working directory',
    });
  }
}
