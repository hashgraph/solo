// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot set up the Hedera SDK client for the network; the underlying failure is wrapped
 * in `cause`. Setup wires the client to the network node endpoints and operator account before any SDK
 * calls, so this means that configuration step failed — for example endpoints could not be resolved or
 * operator credentials were missing or invalid.
 */
export class NodeClientSetupFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to set up node client: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_CLIENT_SETUP_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify consensus node pods are running: kubectl get pods -n <namespace>\n' +
          'Check port-forward status: solo deployment port-forwards refresh\n' +
          'Inspect node logs: kubectl logs <node-pod> -n <namespace>',
      },
      cause,
    );
  }
}
