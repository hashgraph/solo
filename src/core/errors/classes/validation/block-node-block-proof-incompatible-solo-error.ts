// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the selected block node version and the deployed consensus node version sit on opposite
 * sides of the fixed 16-slot block root hash boundary (hiero-consensus-node#26918); the message names both versions.
 * The consensus node streams every block to the block node for verification, so a mismatched pair is rejected with
 * BAD_BLOCK_PROOF and the consensus node block buffer saturates until the network stalls.
 */
export class BlockNodeBlockProofIncompatibleSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(
    blockNodeVersion: string,
    consensusNodeVersion: string,
    minimumBlockNodeVersion: string,
    minimumConsensusNodeVersion: string,
  ) {
    super({
      message:
        `Block node ${blockNodeVersion} and consensus node ${consensusNodeVersion} use incompatible block root hashes: ` +
        `the fixed 16-slot merkle tree requires block node >= ${minimumBlockNodeVersion} together with ` +
        `consensus node >= ${minimumConsensusNodeVersion}`,
      code: ErrorCodeRegistry.BLOCK_NODE_BLOCK_PROOF_INCOMPATIBLE,
      troubleshootingSteps:
        `Upgrade the consensus node to ${minimumConsensusNodeVersion} or newer: solo consensus network upgrade --upgrade-version ${minimumConsensusNodeVersion}\n` +
        `Or pin a block node below ${minimumBlockNodeVersion}: solo block node add --block-node-version <version>\n` +
        'Upgrade both together by staging the consensus node upgrade with --skip-node-start, upgrading the block node, then running solo consensus node start\n' +
        'Or bypass this check with --force if you accept the block verification failures',
    });
  }
}
