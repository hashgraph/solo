// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an upgrade would move a running component across a version boundary that cannot be
 * crossed in place (for example a consensus node TSS library change that does not convert existing keys or proofs);
 * the message names the component, both versions and the reason. The network has to be destroyed and redeployed at
 * the target version instead, which discards its state.
 */
export class ComponentUpgradeRequiresRedeploySoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(componentName: string, currentVersion: string, targetVersion: string, reason: string) {
    super({
      message:
        `${componentName} cannot be upgraded in place from ${currentVersion} to ${targetVersion}: ${reason}. ` +
        'Redeploy the network at the target version instead.',
      code: ErrorCodeRegistry.COMPONENT_UPGRADE_REQUIRES_REDEPLOY,
      troubleshootingSteps:
        `Destroy the network and deploy it again at ${targetVersion}: solo consensus network destroy, then solo consensus network deploy\n` +
        'Redeploying discards the ledger state, so export anything you still need first\n' +
        'Or bypass this check with --force to exercise the upgrade path itself; the upgraded network is not expected to work',
    });
  }
}
