// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown by the `solo cluster-ref state` commands when the container engine is
 * reachable but there is no Kind cluster node container (a container carrying the
 * `io.x-k8s.kind.cluster` label) for Solo to start, stop, or report on — either none exists at all,
 * or none of the ones that exist are mapped to a Solo cluster reference. Typically the cluster was
 * never created, was deleted (`kind delete cluster`), or was never connected to Solo.
 */
export class KindClusterContainerNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  /**
   * @param message - overrides the default message when a Kind cluster was found but is not mapped
   *   to a Solo cluster reference, so the user can see which clusters were skipped.
   */
  public constructor(message: string = 'No Kind cluster container was detected on the local container engine') {
    super({
      message,
      code: ErrorCodeRegistry.KIND_CLUSTER_CONTAINER_NOT_FOUND,
      troubleshootingSteps:
        'List existing Kind clusters: kind get clusters\n' +
        'List the clusters Solo manages: solo cluster-ref config list\n' +
        'Map an existing cluster to Solo: solo cluster-ref config connect --cluster-ref <name> --context kind-<cluster>\n' +
        'Create a cluster with a full deployment: solo one-shot single deploy',
    });
  }
}
