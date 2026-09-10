// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a pod matching the expected labels was found but never reached the
 * required phase or readiness condition before solo stopped waiting; the message names the pod,
 * its last observed phase, and a per-container summary (readiness, restart count, and any
 * waiting/terminated reason). This is distinct from the pod-not-found errors: the pod exists,
 * but something is keeping it from becoming ready — most commonly a failing startup or
 * readiness probe, a crash-looping container, or an unreachable dependency the container's
 * health check verifies. It is retryable because readiness is often only delayed; if it
 * persists, inspect the pod rather than the scheduler.
 */
export class PodNotReadySoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(
    podName: string,
    resource: string,
    phase: string,
    containerSummary: string,
    cause?: Error,
    volumeMountDiagnostic?: string,
  ) {
    super(
      {
        message:
          `Pod ${podName} matched ${resource} but did not become ready before the timeout` +
          ` [phase: ${phase ?? 'Unknown'}${containerSummary ? `; containers: ${containerSummary}` : ''}]` +
          (volumeMountDiagnostic ? ` [volume mount diagnostic: ${volumeMountDiagnostic}]` : ''),
        code: ErrorCodeRegistry.POD_NOT_READY,
        troubleshootingSteps:
          'Describe the pod for probe failures and events: kubectl describe pod -n <namespace> <podName>\n' +
          'Check container logs, including the previous run: kubectl logs -n <namespace> <podName> --previous\n' +
          'If the readiness probe checks a dependency (e.g. a mirror node or database), verify that dependency is healthy\n' +
          (volumeMountDiagnostic
            ? 'Check PVC/PV binding and volume attach events: kubectl get pvc -n <namespace>; kubectl describe pvc -n <namespace> <pvcName>\n'
            : '') +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
