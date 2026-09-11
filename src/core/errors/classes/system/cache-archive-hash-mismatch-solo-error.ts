// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a cached image archive no longer matches the SHA-256 the image cache manifest publishes
 * for it, checked again immediately before the archive is loaded into the cluster; the message names the image and
 * the archive. solo refuses to load bytes it cannot vouch for, so this means the archive was corrupted or altered
 * after it was downloaded — the archive has been deleted and `solo cache image pull` will download it again.
 */
export class CacheArchiveHashMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(image: string, archivePath: string, expectedSha256: string, actualSha256: string) {
    super({
      message:
        `Cached image archive for ${image} does not match the hash published for it and was not loaded: ` +
        `${archivePath} (expected ${expectedSha256}, found ${actualSha256})`,
      code: ErrorCodeRegistry.CACHE_ARCHIVE_HASH_MISMATCH,
      troubleshootingSteps:
        'Run `solo cache image pull` to download the archive again, then retry\n' +
        'The archive has already been deleted, so the next pull will not skip it\n' +
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
