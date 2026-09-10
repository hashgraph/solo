// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot refresh the Hedera SDK client's view of the network; the underlying failure is
 * wrapped in `cause`. solo refreshes the client when the network's nodes or endpoints change, so this means
 * re-resolving the connection details failed — for example node services could not be retrieved or the new
 * endpoints were unreachable.
 */
export class NodeClientRefreshFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to refresh node client: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_CLIENT_REFRESH_FAILED,
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
