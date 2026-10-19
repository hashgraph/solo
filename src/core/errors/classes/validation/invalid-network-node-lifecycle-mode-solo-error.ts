// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the NETWORK_NODE_LIFECYCLE_MODE environment variable holds a value other than
 * `solo-container` or `consensus-node-image`. The message names the rejected value and the accepted ones. solo checks
 * the mode before building any consensus node commands, so nothing has been changed on the cluster — correct the
 * value and re-run.
 */
export class InvalidNetworkNodeLifecycleModeSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(mode: string, acceptedModes: string[]) {
    super({
      message: `Invalid NETWORK_NODE_LIFECYCLE_MODE '${mode}', expected one of: ${acceptedModes.join(', ')}`,
      code: ErrorCodeRegistry.INVALID_NETWORK_NODE_LIFECYCLE_MODE,
      troubleshootingSteps:
        `Set NETWORK_NODE_LIFECYCLE_MODE to one of: ${acceptedModes.join(', ')}\n` +
        'Unset NETWORK_NODE_LIFECYCLE_MODE to use the default solo-container image',
    });
  }
}
