// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a kind cluster's node container was found stopped, solo started it again, and the
 * cluster's Kubernetes API still did not answer; the last API failure is wrapped in `cause`. A kind node that
 * restarts but never serves its API usually means the cluster did not survive whatever stopped it — the host
 * was rebooted and the node's networking or storage no longer lines up, the container is crash-looping, or the
 * kubeconfig entry now points at a port the restarted node no longer listens on. It is retryable because a
 * control plane can simply need longer than solo waited.
 */
export class KindClusterStoppedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(clusterName: string, cause: Error) {
    super(
      {
        message:
          `The kind cluster '${clusterName}' node container was stopped; solo started it, but the ` +
          `Kubernetes API did not become available: ${cause.message}`,
        code: ErrorCodeRegistry.KIND_CLUSTER_STOPPED,
        troubleshootingSteps:
          `Check the node container is running: docker ps -a --filter name=${clusterName}-control-plane\n` +
          `Inspect why the node is not serving its API: docker logs ${clusterName}-control-plane\n` +
          `Verify the cluster answers: kubectl cluster-info --context kind-${clusterName}\n` +
          `Recreate the cluster if it did not survive being stopped: kind delete cluster --name ${clusterName}`,
      },
      cause,
    );
  }
}
