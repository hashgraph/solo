// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the selected component versions would run together in a combination the network does not
 * support (for example a block node too old to verify the blocks a consensus node produces); the message lists every
 * broken constraint and names the component to bump. Running such a combination typically fails block verification
 * or ingestion, so choose versions that satisfy the listed minimums, or pass --force to deploy them anyway.
 */
export class ComponentVersionIncompatibleSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  /**
   * @param conflicts - one sentence per broken constraint, naming both component versions and the reason
   * @param remedies - one line per broken constraint, naming the component to bump and its minimum version
   */
  public constructor(conflicts: string[], remedies: string[]) {
    super({
      message: `Unsupported component version combination:\n${conflicts.map((line: string): string => `- ${line}`).join('\n')}`,
      code: ErrorCodeRegistry.COMPONENT_VERSION_INCOMPATIBLE,
      troubleshootingSteps:
        `${remedies.join('\n')}\n` +
        'Upgrade the lagging component first when the rule allows it\n' +
        'When the consensus node and another component must move together, stage the consensus node upgrade with --skip-node-start, upgrade the other component, then run solo consensus node start\n' +
        'Or bypass this check with --force if you accept the resulting failures',
    });
  }
}
