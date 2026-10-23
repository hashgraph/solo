// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo could not bring the local container engine (Docker Desktop or the
 * Podman machine) into a running state: the platform offers no way to auto-start it (Linux), the
 * start command failed, or the engine did not respond within the startup timeout. The message
 * names the engine and the specific reason.
 */
export class ContainerEngineStartFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(engineName: string, reason: string) {
    super({
      message: `Failed to start container engine '${engineName}': ${reason}`,
      code: ErrorCodeRegistry.CONTAINER_ENGINE_START_FAILED,
      troubleshootingSteps:
        'Start the engine manually (Docker Desktop application, or: podman machine start)\n' +
        'Verify it is running: docker info (or podman info)\n' +
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
