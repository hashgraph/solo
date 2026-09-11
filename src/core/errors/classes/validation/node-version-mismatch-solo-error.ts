// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the consensus node version saved in the remote config differs from the requested version; the
 * message names both. solo guards against mixing versions, so this means the requested version does not
 * match what the deployment recorded — align the versions.
 */
export class NodeVersionMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(savedVersion: string, requestedVersion: string) {
    super({
      message: `Consensus node version saved in remote config ${savedVersion} is different from ${requestedVersion}`,
      code: ErrorCodeRegistry.NODE_VERSION_MISMATCH,
      troubleshootingSteps:
        'Check the saved version: solo deployment config info --deployment <name>\n' +
        'Use the same version: solo consensus node setup --consensus-node-version <savedVersion>\n' +
        'Or upgrade the network first: solo consensus network upgrade --upgrade-version <version>',
    });
  }
}
