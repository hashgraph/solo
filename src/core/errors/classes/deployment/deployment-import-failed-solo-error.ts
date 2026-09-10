// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo deployment config import` cannot reconstruct the local config
 * from a cluster's `solo-remote-config` ConfigMap: the cluster is unreachable, no Solo deployment
 * exists in the targeted context/namespace, the remote config is unparseable, or the selection is
 * ambiguous in quiet mode. Retryable because transient connectivity issues often resolve on retry.
 */
export class DeploymentImportFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(details: string, cause?: Error) {
    super(
      {
        message: `Failed to import deployment configuration: ${details}`,
        code: ErrorCodeRegistry.DEPLOYMENT_IMPORT_FAILED,
        troubleshootingSteps:
          'Verify the kube context is reachable: kubectl --context <context> get namespaces\n' +
          'Verify the targeted namespace contains a Solo deployment (solo-remote-config ConfigMap)\n' +
          'Check logs for details: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
