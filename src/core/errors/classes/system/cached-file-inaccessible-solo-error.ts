// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a file solo previously cached under SOLO_HOME can no longer be opened; the message names
 * the path and the underlying failure is in `cause`. The cache is reused across deploys, so this means the file
 * survived but its permissions no longer allow access — on Windows an empty DACL (which denies every principal,
 * including the owner, and blocks deletion) and on POSIX a foreign owner or a cleared mode are the usual roots.
 */
export class CachedFileInaccessibleSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(filePath: string, cause: Error) {
    super(
      {
        message: `Cached file is not accessible: ${filePath}`,
        code: ErrorCodeRegistry.CACHED_FILE_INACCESSIBLE,
        troubleshootingSteps:
          'This is a local cache problem, not a cluster problem; the cluster does not need to be recreated\n' +
          'On Windows, repair the permissions: icacls "<path>" /reset\n' +
          'If that reports access denied, take ownership first: takeown /f "<path>"\n' +
          'On macOS and Linux, check the owner and mode: ls -l <path>\n' +
          'Then delete the file so solo re-creates it on the next run\n' +
          'To repair the whole cache on Windows: ' +
          String.raw`takeown /f "%USERPROFILE%\.solo" /r /d y && icacls "%USERPROFILE%\.solo" /reset /t /c /q`,
      },
      cause,
    );
  }
}
