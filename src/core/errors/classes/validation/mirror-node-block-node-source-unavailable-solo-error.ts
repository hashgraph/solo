// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a mirror node is asked to import from a block node but block node integration does not
 * apply to it. solo only configures a mirror node to read from a block node when a block node is registered in the
 * same cluster, TSS is enabled and the consensus node version supports it; otherwise it would silently fall back to
 * the consensus node's record files, which is not what an explicit block node source asks for.
 */
export class MirrorNodeBlockNodeSourceUnavailableSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string) {
    super({
      message: `The mirror node cannot import from a block node: block node integration does not apply in cluster ${clusterReference}`,
      code: ErrorCodeRegistry.MIRROR_NODE_BLOCK_NODE_SOURCE_UNAVAILABLE,
      troubleshootingSteps:
        'Deploy a block node in the same cluster first: solo block node add\n' +
        'Check that TSS is enabled and that the consensus node version supports block node integration\n' +
        'Use --force to bypass the version requirements\n' +
        'Or use --mirror-node-source bucket|auto to import from the consensus node record files instead',
    });
  }
}
