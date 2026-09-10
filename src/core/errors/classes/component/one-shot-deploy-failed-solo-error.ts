// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a one-shot deployment fails; the message describes the failing step and wraps the underlying
 * failure in `cause`. One-shot mode brings up a complete network in a single command by running many deploy
 * steps in sequence, so this means one of those steps did not succeed — the message identifies which, and
 * common roots are Helm, image, or cluster-resource problems in the underlying step.
 */
export class OneShotDeployFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(message: string, cause: Error) {
    super(
      {
        message,
        code: ErrorCodeRegistry.ONE_SHOT_DEPLOY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'If rollback was skipped, clean up partial resources: solo one-shot single destroy\n' +
          'If nothing else works, remove the SOLO_HOME directory and delete the cluster:\n +' +
          'kind delete cluster --name solo-cluster\n' +
          'rm -rf ~/.solo\n',
      },
      cause,
    );
  }
}
