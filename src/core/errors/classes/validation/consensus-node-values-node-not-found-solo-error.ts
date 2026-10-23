// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when translating umbrella Helm values into per-node values and the requested node
 * is absent from `hedera.nodes`. solo derives one Helm release per consensus node from that list, so a
 * missing entry means the node list and the requested node set disagree.
 */
export class ConsensusNodeValuesNodeNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(nodeName: string) {
    super({
      message: `Consensus node '${nodeName}' was not found in the merged hedera.nodes values`,
      code: ErrorCodeRegistry.CONSENSUS_NODE_VALUES_NODE_NOT_FOUND,
      troubleshootingSteps:
        `Verify '${nodeName}' is listed in --node-aliases\n` +
        'Check that any --values-file you passed does not replace the hedera.nodes array\n' +
        'Helm replaces arrays rather than merging them, so a partial node list in a values file overrides the generated one',
    });
  }
}
