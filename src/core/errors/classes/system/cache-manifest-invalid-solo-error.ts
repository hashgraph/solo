// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the downloaded image cache manifest does not match the expected schema; the message names
 * the manifest URL and what was wrong. solo refuses to act on a manifest it cannot fully validate because the
 * entries drive downloads and hash checks, so this means the published artifact is malformed — report it.
 */
export class CacheManifestInvalidSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(url: string, reason: string) {
    super({
      message: `Invalid image cache manifest at ${url}: ${reason}`,
      code: ErrorCodeRegistry.CACHE_MANIFEST_INVALID,
      troubleshootingSteps: `File a bug report with the manifest URL: ${SoloError.bugReportUrl}`,
    });
  }
}
