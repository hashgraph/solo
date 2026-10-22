// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a block node does not expose any block above the mirror importer's last imported block
 * within the wait window; the message names the block number and the wait duration. It is retryable, since the block
 * node may simply still be starting after a restore; a persistent failure points to a consensus node that is not
 * streaming blocks to the block node.
 */
export class BlockNodeBlocksUnavailableSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(afterBlock: number, waitedSeconds: number) {
    super({
      message: `Block node has no block above ${afterBlock} after waiting ${waitedSeconds}s`,
      code: ErrorCodeRegistry.BLOCK_NODE_BLOCKS_UNAVAILABLE,
      troubleshootingSteps:
        'Verify the consensus node is ACTIVE and streaming blocks to the block node\n' +
        'Check block node logs for the status heartbeat (newestBlock): kubectl logs -A -l app.kubernetes.io/name=block-node\n' +
        'Re-run: solo config ops bridge-import-gap',
    });
  }
}
