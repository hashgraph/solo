// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a required dependency is not found; the message names it. solo expects certain external tools
 * to be available, so this means the dependency could not be located — for example it is not installed or
 * not on `PATH`.
 */
export class DependencyNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(dependency: string) {
    super({
      message: `Dependency '${dependency}' is not found`,
      code: ErrorCodeRegistry.DEPENDENCY_NOT_FOUND,
      troubleshootingSteps:
        `Install the missing dependency: ${dependency}\n` +
        'Re-run the command; solo installs the dependencies it manages automatically\n' +
        `Verify the dependency is in your PATH: which ${dependency}`,
    });
  }
}
