// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot restore a consensus node's gossip keys from its Kubernetes secret back to the
 * local keys directory; the message names the node alias. When `--debug` is off the on-disk gossip keys are deleted
 * after they are uploaded to the cluster, so later commands re-fetch them from the secret — this means that secret
 * could not be read or did not contain the expected key files (for example the namespace or secret is missing, or
 * the Kubernetes API rejected the request).
 */
export class GossipKeySecretRestoreFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, additionalMessage?: string, cause?: Error) {
    super(
      {
        message:
          `Failed to restore gossip keys from Kubernetes secret for node '${nodeAlias}'` +
          (additionalMessage ? `: ${additionalMessage}` : ''),
        code: ErrorCodeRegistry.GOSSIP_KEY_SECRET_RESTORE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          `Confirm the gossip key secret exists: kubectl get secret network-${nodeAlias}-keys-secrets -n <namespace>\n` +
          'Verify RBAC permissions allow reading secrets in the namespace',
      },
      cause,
    );
  }
}
