// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot load the Hedera SDK client used to talk to the network; the underlying failure is
 * wrapped in `cause`. The client is built from network and node connection details plus operator
 * credentials, so this means that load step failed — for example the node services or endpoints could not
 * be resolved, or the operator key was missing or invalid.
 */
export class NodeClientLoadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to load node client: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_CLIENT_LOAD_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify consensus node pods are running: kubectl get pods -n <namespace>\n' +
          'Inspect node pod logs: kubectl logs <node-pod> -n <namespace>\n' +
          'Verify network port-forwards are active: solo deployment port-forwards refresh',
      },
      cause,
    );
  }
}
