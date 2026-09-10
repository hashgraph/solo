// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo detects that a consensus node's container has entered a
 * non-recoverable crash state (e.g. CrashLoopBackOff, OOMKilled) while polling for the node to
 * become active. The underlying process will never recover on its own, so solo fails fast
 * instead of exhausting the full polling timeout.
 */
export class NodeContainerCrashedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, reason: string) {
    super({
      message: `Node '${nodeAlias}' container has crashed and cannot become active: ${reason}`,
      code: ErrorCodeRegistry.NODE_CONTAINER_CRASHED,
      troubleshootingSteps:
        'Check node pod status: kubectl get pods -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\n' +
        'View previous container logs: kubectl logs -n <namespace> -l solo.hedera.com/node-name=<nodeAlias> --previous\n' +
        'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
