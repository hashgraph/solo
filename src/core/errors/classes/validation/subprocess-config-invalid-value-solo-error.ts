// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the operator's Solo config file parses as YAML but a value has the wrong
 * shape — most often a bare string where a list of environment variable names is expected, which
 * would otherwise be iterated character by character and silently allowlist single letters.
 */
export class SubprocessConfigInvalidValueSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(configFilePath: string, detail: string) {
    super({
      message: `Invalid value in the Solo config file at ${configFilePath}: ${detail}`,
      code: ErrorCodeRegistry.SUBPROCESS_CONFIG_INVALID_VALUE,
      troubleshootingSteps:
        "Write each command's entry as a YAML list, for example:\n" +
        '  subprocess:\n' +
        '    additionalEnvironmentVariables:\n' +
        '      helm:\n' +
        '        - MY_VARIABLE\n' +
        'Remove the file to fall back to Solo defaults',
    });
  }
}
