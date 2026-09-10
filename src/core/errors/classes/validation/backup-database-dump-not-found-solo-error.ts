// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the external database dump file is missing from the restore input directory; the message
 * names the expected path. The backup must be created with --backup-external-database for this path to exist.
 */
export class BackupDatabaseDumpNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(databaseDumpPath: string) {
    super({
      message:
        `External database dump is required for restore but was not found at ${databaseDumpPath}. ` +
        'Create the backup with --backup-external-database and restore from the extracted backup directory.',
      code: ErrorCodeRegistry.BACKUP_DATABASE_DUMP_NOT_FOUND,
      troubleshootingSteps:
        'Re-run the backup with --backup-external-database to include the database dump\n' +
        'Verify the restore input path points to an extracted backup directory, not a zip file\n' +
        `Expected dump file location: ${databaseDumpPath}`,
    });
  }
}
