// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Kubernetes API call against a remote cluster fails for any reason other than the
 * resource being absent; the message names the kubeconfig context and the underlying failure, which is also
 * wrapped in `cause`. solo reads and writes cluster state over the Kubernetes API for every deployment
 * operation, so this means the call never produced a usable answer: the API server is down or unreachable over
 * the network, the kubeconfig context points at a cluster that no longer exists, credentials have expired, or
 * RBAC denied the request. Kind clusters are excluded — a local kind API failure is reported as a Kubernetes API
 * invalid response instead. It is retryable because an API server that is restarting, or a transient network
 * problem, often clears on a later attempt.
 */
export class ClusterUnreachableError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(context: string, cause: Error) {
    super(
      {
        message: `Unable to reach the cluster with context: ${context}: ${cause.message}`,
        code: ErrorCodeRegistry.CLUSTER_UNREACHABLE,
        troubleshootingSteps:
          'Verify the cluster is reachable: kubectl cluster-info --context <context>\n' +
          'Verify the kubeconfig context still exists: kubectl config get-contexts\n' +
          'Verify your credentials and RBAC permissions for the namespace\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
