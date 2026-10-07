// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when --transplant is supplied without --state-file. A transplant replaces the roster carried
 * by a state captured on a different network, so without a state file there is nothing to transplant and the flag
 * would silently have no effect.
 */
export class TransplantRequiresStateFileSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: '--transplant requires --state-file',
      code: ErrorCodeRegistry.TRANSPLANT_REQUIRES_STATE_FILE,
      troubleshootingSteps:
        'Pass the state captured on the other network, e.g. --transplant --state-file <path-to-state.zip>\n' +
        'Omit --transplant when restoring a network from its own state, which must keep the roster in that state',
    });
  }
}
