// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo fails to reload the local configuration from its on-disk
 * source — that is, the re-read and re-parse of `~/.solo/local-config.yaml` (or
 * `$SOLO_HOME/local-config.yaml`) did not complete; the message names the offending file and
 * the underlying failure is wrapped in `cause`. Unlike `LocalConfigNotFoundSoloError`, the
 * file is present: it could not be read (insufficient permissions, an I/O error) or its
 * contents could not be parsed into the expected configuration because the file is malformed
 * or corrupt. A malformed file can be regenerated from a cluster's remote config with
 * `solo deployment config import`.
 */
export class RefreshLocalConfigSourceError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(filePath: string, cause?: Error) {
    super(
      {
        message: `Failed to refresh local configuration source: ${filePath}`,
        code: ErrorCodeRegistry.REFRESH_LOCAL_CONFIG_SOURCE,
        troubleshootingSteps:
          `Check file system permissions and contents of the file: ${filePath}\n` +
          "Regenerate the local config from a cluster's remote config: solo deployment config import",
      },
      cause,
    );
  }
}
