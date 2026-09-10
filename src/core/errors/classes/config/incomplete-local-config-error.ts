// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the local configuration file (`~/.solo/local-config.yaml`, or
 * `$SOLO_HOME/local-config.yaml`) parses as valid YAML but is missing required top-level keys
 * such as `deployments` or `clusterRefs`; the message names the file and the missing keys.
 * Without this check a partial file — typically left behind by an interrupted write or a manual
 * edit — would silently load as a valid-but-empty config and only surface later as a confusing
 * `DeploymentNotFoundError`. The file can be regenerated from a cluster's remote config with
 * `solo deployment config import`.
 */
export class IncompleteLocalConfigError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(filePath: string, missingKeys: string[], cause?: Error) {
    super(
      {
        message: `Local configuration file is incomplete (missing: ${missingKeys.join(', ')}): ${filePath}`,
        code: ErrorCodeRegistry.INCOMPLETE_LOCAL_CONFIG,
        troubleshootingSteps:
          "Regenerate the local config from a cluster's remote config: solo deployment config import\n" +
          `Or restore the missing keys in the file manually: ${filePath}`,
      },
      cause,
    );
  }
}
