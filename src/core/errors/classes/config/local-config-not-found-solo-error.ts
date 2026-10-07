// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo reads its local configuration but no file exists at the
 * resolved path (`~/.solo/local-config.yaml`, or `$SOLO_HOME/local-config.yaml` when
 * `SOLO_HOME` is set). The local config records cluster references, deployments, and the
 * active user context, so most commands load it before doing any work. solo creates the file the
 * first time a command loads it, so a missing file means `SOLO_HOME` points at a different
 * directory than the one the file was created in, or that it was manually moved or deleted.
 */
export class LocalConfigNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Local configuration file not found',
        code: ErrorCodeRegistry.LOCAL_CONFIG_NOT_FOUND,
        troubleshootingSteps:
          'Create a local config: solo deployment config create --deployment <deployment-name> --namespace <namespace>',
      },
      cause,
    );
  }
}
