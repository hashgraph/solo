// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the value supplied for a flag does not satisfy the rules that flag declares —
 * for example a namespace that is not a valid DNS label, a node alias that is not of the form `node<number>`,
 * or a count below its minimum. The message names the flag, the rejected value and the requirement it broke.
 * solo checks flag values before doing any work, so nothing has been changed on the cluster — correct the
 * value and re-run.
 */
export class InvalidFlagValueSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string, value: string, requirement: string) {
    super({
      message: `Invalid value '${value}' for flag --${flagName}: ${requirement}`,
      code: ErrorCodeRegistry.INVALID_FLAG_VALUE,
      troubleshootingSteps:
        `Correct the value passed to --${flagName}\n` +
        'Run solo --help for usage information and accepted flag values',
    });
  }
}
