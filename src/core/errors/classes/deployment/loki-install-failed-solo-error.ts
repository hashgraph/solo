// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown during cluster setup when the Loki Helm chart fails to install; the
 * underlying failure is wrapped in `cause`. Loki stores the pod logs collected by Grafana Alloy,
 * both installed by `solo cluster-ref config setup --grafana-alloy`. The failure is typically a
 * Helm error (bad chart version or values), an image that cannot be pulled, or a cluster without
 * the resources/connectivity to schedule its pods.
 */
export class LokiInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Loki chart installation failed: ${cause.message}`,
        code: ErrorCodeRegistry.LOKI_INSTALL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect cluster pods: kubectl get pods -A\n' +
          'Check Helm release status: helm list -A\n' +
          'Verify cluster connectivity: kubectl cluster-info',
      },
      cause,
    );
  }
}
