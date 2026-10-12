// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a `--state-file` restore settles some nodes into ACTIVE and others into
 * FREEZE_COMPLETE instead of all nodes reaching the same terminal status; the message lists each node
 * alias with the status it reached. `checkAllNodesAreActiveOrFrozen` waits for every node to reach one of
 * those two statuses and only skips the ACTIVE-only follow-up work when every node came up frozen, so a
 * mixed result means the nodes disagree about whether the restored snapshot replays back into a freeze —
 * continuing would run the ACTIVE-only checks against a node that can never become ACTIVE without a fresh
 * start, which only fails after burning the full activeness timeout.
 */
export class NodeRestoreStatusMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(statusByNodeAlias: Record<string, string>) {
    const statusSummary: string = Object.entries(statusByNodeAlias)
      .map(([nodeAlias, status]): string => `${nodeAlias}=${status}`)
      .join(', ');

    super({
      message: `Restored nodes disagree on terminal status: ${statusSummary}`,
      code: ErrorCodeRegistry.NODE_RESTORE_STATUS_MISMATCH,
      troubleshootingSteps:
        'Every restored node must reach the same status, ACTIVE or FREEZE_COMPLETE\n' +
        'Check pod status for the node(s) that disagree: kubectl get pods -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>\n' +
        'Review node logs: kubectl logs -n <namespace> -l solo.hedera.com/node-name=<nodeAlias>',
    });
  }
}
