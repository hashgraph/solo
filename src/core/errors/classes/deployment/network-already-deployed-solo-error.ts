// SPDX-License-Identifier: Apache-2.0

import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {SoloError} from '../../solo-error.js';

/**
 * @description Thrown when `solo consensus network deploy` is used for a network that already has
 * the Solo deployment chart installed. Deploy is a first-time operation and does not perform the
 * freeze, reconfiguration, and restart lifecycle required by an existing consensus network.
 */
export class NetworkAlreadyDeployedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deploymentName: string, namespaceName: string, clusterReference: string) {
    super({
      message:
        `Network deployment '${deploymentName}' already exists in namespace '${namespaceName}' ` +
        `for cluster '${clusterReference}'. 'consensus network deploy' is for first-time deployments ` +
        'and cannot reconfigure or restart an existing consensus network.',
      code: ErrorCodeRegistry.NETWORK_ALREADY_DEPLOYED,
      troubleshootingSteps:
        `Upgrade the existing network: solo consensus network upgrade --deployment ${deploymentName}\n` +
        'For a fresh deployment, destroy the existing network before running network deploy',
    });
  }
}
