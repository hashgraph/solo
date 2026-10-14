// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a post-upgrade system file flag is used with an --upgrade-version older than the first
 * consensus node release that applies that file; the message names the flag and both versions. Older nodes never
 * read the file, so the upgrade would succeed without changing the system file.
 */
export class PostUpgradeSystemFileVersionUnsupportedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string, minimumVersion: string, upgradeVersion: string) {
    super({
      message: `--${flagName} requires consensus node ${minimumVersion} or later, but --upgrade-version is ${upgradeVersion}`,
      code: ErrorCodeRegistry.POST_UPGRADE_SYSTEM_FILE_VERSION_UNSUPPORTED,
      troubleshootingSteps:
        `Upgrade to consensus node ${minimumVersion} or later to apply this file\n` +
        `Or remove --${flagName}; this consensus node version ignores the file`,
    });
  }
}
