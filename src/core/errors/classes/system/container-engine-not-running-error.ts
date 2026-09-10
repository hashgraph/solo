// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo needs the local container engine and neither Docker nor Podman answers; the
 * failure that led solo to look is wrapped in `cause`. A local kind cluster only exists as containers on this
 * machine, so with no engine running solo can neither reach the cluster nor tell whether it is still there.
 * The usual reason is simply that Docker Desktop, the Docker daemon or the Podman machine is not started. solo
 * does not start the engine itself, because doing so is platform-specific and needs privileges the CLI should
 * not take on its own. It is retryable once the engine is up.
 */
export class ContainerEngineNotRunningError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(cause: Error) {
    super(
      {
        message: `No container engine is running, so the local cluster cannot be reached: ${cause.message}`,
        code: ErrorCodeRegistry.CONTAINER_ENGINE_NOT_RUNNING,
        troubleshootingSteps:
          'Start Docker Desktop, or the Docker daemon: sudo systemctl start docker\n' +
          'If you use Podman, start its machine: podman machine start\n' +
          'Confirm the engine answers: docker info\n' +
          'Then re-run the command',
      },
      cause,
    );
  }
}
