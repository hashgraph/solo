// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot store the JSON-RPC relay's operator credentials as a Kubernetes secret; the
 * message names the secret. Solo passes the relay operator id and key to the relay Helm chart via a
 * pre-created Kubernetes secret rather than plaintext `--set` values, so this is raised when that secret
 * cannot be created — for example the namespace is missing or the Kubernetes API rejected the request.
 */
export class RelayOperatorSecretCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(secretName: string, cause?: Error) {
    super(
      {
        message: `Failed to create Kubernetes secret for relay operator credentials: ${secretName}`,
        code: ErrorCodeRegistry.RELAY_OPERATOR_SECRET_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Kubernetes connectivity: kubectl get pods -n <namespace>\n' +
          'Check existing secrets: kubectl get secrets -n <namespace>\n' +
          'Verify RBAC permissions allow secret creation',
      },
      cause,
    );
  }
}
