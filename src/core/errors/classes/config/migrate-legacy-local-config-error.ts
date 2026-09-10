// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot migrate the legacy local configuration from the old cache
 * path (`$SOLO_HOME/cache/local-config.yaml`) to the current path (`$SOLO_HOME/local-config.yaml`).
 * The migration copies the legacy file to the current path and validates it *before* the legacy file is
 * removed, so this error is raised either because a filesystem operation failed (copy/remove/mkdir,
 * wrapped in `cause`) or because the legacy configuration is corrupt and cannot be parsed. In both
 * cases the legacy file is left in place — it is never deleted while unvalidated — and the corrupt
 * copy (if any) is discarded, so no configuration is silently propagated or lost.
 */
export class MigrateLegacyLocalConfigError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error, legacyConfigFile?: string) {
    super(
      {
        message: legacyConfigFile
          ? `Failed to migrate legacy local configuration file: ${legacyConfigFile}`
          : 'Failed to migrate legacy local configuration file',
        code: ErrorCodeRegistry.MIGRATE_LEGACY_LOCAL_CONFIG,
        troubleshootingSteps: legacyConfigFile
          ? `Inspect the legacy file at ${legacyConfigFile}. If it is corrupt, fix the YAML or remove it, ` +
            'then re-run the command. Also verify file system permissions for your Solo home directory.'
          : 'Inspect the legacy local configuration file. If it is corrupt, fix the YAML or remove it, then ' +
            're-run the command. Also verify file system permissions for your Solo home directory.',
      },
      cause,
    );
  }
}
