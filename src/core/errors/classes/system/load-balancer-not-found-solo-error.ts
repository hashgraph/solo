// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot find the expected load balancer. solo looks up the load balancer that exposes a
 * service externally, so this is raised when none is present yet. It is retryable because the load balancer
 * may still be provisioning (for example waiting on MetalLB or a cloud provider); a persistent failure
 * points to a networking misconfiguration.
 */
export class LoadBalancerNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Load balancer not found',
        code: ErrorCodeRegistry.LOAD_BALANCER_NOT_FOUND,
        troubleshootingSteps:
          'Check load balancer service status: kubectl get svc -n <namespace>\n' +
          'Ensure your cloud provider supports LoadBalancer services\n' +
          'Review cloud provisioning logs for LB assignment delays',
      },
      cause,
    );
  }
}
