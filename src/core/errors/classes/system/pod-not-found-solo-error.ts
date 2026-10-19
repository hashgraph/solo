// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo queries Kubernetes for the pod backing a consensus node
 * alias and the lookup returns no pod; the message names the alias. solo needs the pod to
 * run commands, copy files, or check status on a node, so this fires when no pod matches the
 * expected labels in the namespace. Because pod scheduling is asynchronous, it can appear
 * briefly during startup before the pod exists, which is why it is retryable; if it persists,
 * the pod failed to schedule or start, was evicted, or the node was never deployed. This is
 * the base error for the component-specific variants (explorer, relay, mirror-node,
 * block-node, and Postgres pod-not-found errors).
 */
export class PodNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, cause?: Error, volumeMountDiagnostic?: string) {
    super(
      {
        message:
          `No pod found for nodeAlias: ${nodeAlias}` +
          (volumeMountDiagnostic ? ` [volume mount diagnostic: ${volumeMountDiagnostic}]` : ''),
        code: ErrorCodeRegistry.POD_NOT_FOUND,
        troubleshootingSteps:
          'Check pod status: kubectl get pods -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\n' +
          'Describe the pod for events: kubectl describe pod -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\n' +
          (volumeMountDiagnostic
            ? 'A StatefulSet whose claim cannot be provisioned never creates its pod; check PVC/PV binding: kubectl get pvc,pv -n <namespace>\n' +
              'Check the storage class and its provisioner: kubectl get storageclass\n'
            : '') +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
