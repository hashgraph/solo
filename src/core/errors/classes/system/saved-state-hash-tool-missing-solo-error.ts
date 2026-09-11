// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the consensus-node container has none of `sha256sum`, `shasum`, or `openssl`; the
 * message names the pod. `wait-for-stable-saved-state.sh` fingerprints the saved-state directory with
 * whichever of those is available to detect when background flushes stop changing disk contents, and this
 * is permanent for a given image rather than something that resolves with more polling attempts, so solo
 * fails fast instead of waiting out the full saved-state stability timeout.
 */
export class SavedStateHashToolMissingSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(podName: string) {
    super({
      message: `Pod '${podName}' has no sha256sum, shasum, or openssl; cannot detect when the saved state stabilizes`,
      code: ErrorCodeRegistry.SAVED_STATE_HASH_TOOL_MISSING,
      troubleshootingSteps:
        'Use a consensus-node image that includes sha256sum, shasum, or openssl\n' +
        'Check the image in use: kubectl get pod <pod> -n <namespace> -o jsonpath="{.spec.containers[*].image}"',
    });
  }
}
