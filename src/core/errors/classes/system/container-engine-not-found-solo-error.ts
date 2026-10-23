// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when neither the Docker nor the Podman CLI is installed on this machine.
 * The `solo cluster-ref state` commands need a local container engine to detect and control Kind
 * cluster containers, so without one there is nothing to operate on.
 */
export class ContainerEngineNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No container engine (Docker or Podman) was detected on this machine',
      code: ErrorCodeRegistry.CONTAINER_ENGINE_NOT_FOUND,
      troubleshootingSteps:
        'Install Docker Desktop: https://docs.docker.com/get-docker/\n' +
        'Or install Podman: https://podman.io/docs/installation\n' +
        'Verify the installation: docker --version (or podman --version)',
    });
  }
}
