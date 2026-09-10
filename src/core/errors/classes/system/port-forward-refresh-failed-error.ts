// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot refresh its port-forwards; when available the underlying failure is wrapped in
 * `cause`. solo periodically re-establishes port-forwards so endpoints stay reachable, so this means that
 * refresh failed — for example a target pod was unavailable or the API connection dropped. It is retryable.
 */
export class PortForwardRefreshFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error refreshing port-forwards',
        code: ErrorCodeRegistry.PORT_FORWARD_REFRESH_FAILED,
        troubleshootingSteps:
          'Check the all pods exist and are running: kubectl get pods -n <namespace>\n' +
          'Check the port-forwards of your deployment: solo deployment config ports --deployment <deployment-name>\n' +
          'Restart the port-forward: solo deployment port-forwards refresh --deployment <deployment-name>',
      },
      cause,
    );
  }
}
