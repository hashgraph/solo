// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a post-upgrade system file flag is combined with --upgrade-zip-file; the message names the
 * flag. solo only adds these files to the upgrade zip it builds itself, so with a user-supplied zip the flag
 * would be silently ignored.
 */
export class UpgradeSystemFileWithZipFileSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string) {
    super({
      message: `--${flagName} cannot be combined with --upgrade-zip-file`,
      code: ErrorCodeRegistry.UPGRADE_SYSTEM_FILE_WITH_ZIP_FILE,
      troubleshootingSteps:
        `Remove --upgrade-zip-file to let solo build the upgrade zip with the --${flagName} file\n` +
        `Or remove --${flagName} and place the file under data/config/ inside your upgrade zip`,
    });
  }
}
