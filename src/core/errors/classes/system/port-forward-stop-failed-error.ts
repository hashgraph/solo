// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot stop its port-forwards; when available the underlying failure is wrapped in
 * `cause`. Stopping tears down the running kubectl port-forward processes and removes their configuration from the
 * deployment's remote config, so this means that teardown failed — for example a process could not be signalled or the
 * remote config could not be persisted. It is retryable.
 */
export class PortForwardStopFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error stopping port-forwards',
        code: ErrorCodeRegistry.PORT_FORWARD_STOP_FAILED,
        troubleshootingSteps:
          'Check the port-forwards of your deployment: solo deployment config ports --deployment <deployment-name>\n' +
          'Check for lingering processes: ps aux | grep port-forward',
      },
      cause,
    );
  }
}
