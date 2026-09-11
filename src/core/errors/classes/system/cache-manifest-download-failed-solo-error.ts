// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the image cache manifest cannot be downloaded from the Solo release assets; the message
 * names the manifest URL. solo reads this manifest to learn which image archives to download, so this means
 * the release has no manifest published or the network call failed — check connectivity and confirm the
 * running Solo version has a published release.
 */
export class CacheManifestDownloadFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(url: string, cause?: Error) {
    super(
      {
        message: `Failed to download the image cache manifest: ${url}`,
        code: ErrorCodeRegistry.CACHE_MANIFEST_DOWNLOAD_FAILED,
        troubleshootingSteps:
          'Confirm the machine can reach github.com\n' +
          'Confirm the running Solo version has a published release with a cache-manifest.json asset\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
