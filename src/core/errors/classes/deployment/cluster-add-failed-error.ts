// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when attaching a cluster to a deployment fails due to an unexpected error;
 * the underlying failure is wrapped in `cause`. Specific failures such as missing cluster
 * references or missing deployments are raised as dedicated error types, so this error serves as
 * the fallback for unexpected errors encountered while attaching a cluster. It is retryable,
 * since transient infrastructure or cluster issues may clear on a subsequent attempt.
 */
export class ClusterAddFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(clusterReferenceFlagKey?: string, contextFlagKey?: string, cause?: Error) {
    super(
      {
        message: 'Error adding cluster to deployment',
        code: ErrorCodeRegistry.CLUSTER_ADD_FAILED,
        troubleshootingSteps: 'Check logs for details: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
