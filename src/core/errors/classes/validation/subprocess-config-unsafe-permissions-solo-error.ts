// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the operator's Solo config file cannot be trusted because of its
 * ownership or type. That file selects which additional parent environment variables are forwarded
 * to `helm` and `kubectl`, so anyone able to write it can widen what those commands receive;
 * honouring a file Solo does not control would make the setting an escalation path rather than a
 * convenience.
 */
export class SubprocessConfigUnsafePermissionsSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(configFilePath: string, reason: string) {
    super({
      message: `Refusing to read the Solo config file at ${configFilePath} because ${reason}`,
      code: ErrorCodeRegistry.SUBPROCESS_CONFIG_UNSAFE_PERMISSIONS,
      troubleshootingSteps:
        `Make the file a regular file owned by the current user: chown "$(id -un)" ${configFilePath}\n` +
        `Remove group and other write access: chmod 600 ${configFilePath}\n` +
        'Apply the same to the containing directory, typically ~/.solo\n' +
        'Remove the file to fall back to Solo defaults',
    });
  }
}
