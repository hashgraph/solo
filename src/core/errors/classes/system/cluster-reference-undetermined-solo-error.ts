// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown during initialization when solo cannot determine which cluster reference to use. solo expects the
 * active cluster reference to be resolvable at this point, so reaching this indicates an internal
 * initialization or ordering defect rather than user input, and is treated as an internal Solo error.
 */
export class ClusterReferenceUndeterminedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor() {
    super({
      message: 'Error during initialization, cluster reference could not be determined',
      code: ErrorCodeRegistry.CLUSTER_REF_UNDETERMINED,
      troubleshootingSteps:
        'Check the remote config: kubectl get configmap -n <namespace> -o yaml\n' +
        'Verify cluster references: solo deployment config info --deployment <name>\n' +
        'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
