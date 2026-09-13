// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a `docker save` archive's `manifest.json` does not list the image reference passed via
 * `--component-image`. Loading such an archive succeeds, but the deployed pod then fails much later with
 * `ErrImageNeverPull` since the requested tag was never actually loaded into the Kind cluster.
 */
export class ComponentImageArchiveTagMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(componentImage: string, componentImageArchive: string, repoTags: string[]) {
    super({
      message:
        `Component image archive '${componentImageArchive}' does not contain '${componentImage}'; ` +
        `it contains: '${repoTags.join("', '")}'`,
      code: ErrorCodeRegistry.COMPONENT_IMAGE_ARCHIVE_TAG_MISMATCH,
      troubleshootingSteps:
        'Pass the exact image reference reported by `docker save` in --component-image\n' +
        'Re-create the archive with `docker save <image>:<tag> -o <archive>` using the intended tag',
    });
  }
}
