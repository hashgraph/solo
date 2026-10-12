// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot install Homebrew. On macOS solo may use Homebrew to install some dependencies, so
 * this means the Homebrew installation did not succeed — for example the install script failed or could not
 * be downloaded.
 */
export class HomebrewInstallFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'Failed to install Homebrew',
      code: ErrorCodeRegistry.HOMEBREW_INSTALL_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify network connectivity\n' +
        'Install Homebrew manually from https://brew.sh\n' +
        'Re-run the command after installing Homebrew',
    });
  }
}
