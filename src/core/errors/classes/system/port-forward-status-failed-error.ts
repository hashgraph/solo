// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot display port-forward status; when available the underlying failure is wrapped in
 * `cause`. solo reads the state of active port-forwards to report it, so this means that status query
 * failed — for example the cluster API was unreachable. It is retryable.
 */
export class PortForwardStatusFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error displaying port-forward status',
        code: ErrorCodeRegistry.PORT_FORWARD_STATUS_FAILED,
        troubleshootingSteps:
          'Check the all pods exist and are running: kubectl get pods -n <namespace>\n' +
          'Restart the port-forward: solo deployment port-forwards refresh --deployment <deployment-name>',
      },
      cause,
    );
  }
}
