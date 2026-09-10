// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the container runtime stack behind the Homebrew-installed podman on Linux cannot be
 * configured or fails its post-configuration probe — for example the crun or conmon binary is missing from the
 * Homebrew prefix, a network helper download failed, or podman rejects the generated configuration. Without this
 * configuration podman would fall back to the host's system container stack, which may be too old for it.
 */
export class PodmanRuntimeConfigurationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(detail: string, cause?: Error) {
    super(
      {
        message: `Failed to configure the podman container runtime: ${detail}`,
        code: ErrorCodeRegistry.PODMAN_RUNTIME_CONFIGURATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the Homebrew podman installation: brew doctor && podman info\n' +
          'Inspect the generated configuration files under ~/.solo/config (containers.conf, registries.conf)\n' +
          'Reinstall the Homebrew podman stack if binaries are missing: brew reinstall podman',
      },
      cause,
    );
  }
}
