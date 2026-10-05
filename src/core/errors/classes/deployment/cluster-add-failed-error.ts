// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when attaching a cluster to a deployment fails; the underlying failure is
 * wrapped in `cause`. Attaching binds a registered cluster reference (and its kubeconfig
 * context) to the deployment so components can be placed there, so this is raised when that step
 * cannot complete — commonly because the cluster reference has not been created/connected yet,
 * the kubeconfig context does not exist, or the cluster is unreachable. It is retryable, since a
 * transient connectivity issue often clears once the reference and context are valid.
 */
export class ClusterAddFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(clusterReferenceFlagKey: string, contextFlagKey: string, cause?: Error) {
    super(
      {
        message: 'Error adding cluster to deployment',
        code: ErrorCodeRegistry.CLUSTER_ADD_FAILED,
        troubleshootingSteps:
          'List available cluster references: solo cluster-ref config list\n' +
          'Verify the cluster context exists: kubectl config get-contexts\n' +
          `Make sure the cluster reference is created: solo cluster-ref config connect ${clusterReferenceFlagKey} <cluster-reference> ${contextFlagKey} <context>\n` +
          'Check logs for details: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
