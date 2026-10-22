// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when consensus node PersistentVolumeClaims are still unbound after the wait budget expires.
 * Each consensus node declares 13 volume claims and provisioners bind them serially, so a large network waits on
 * many claims before any pod can be scheduled. The message names how many claims bound and which are outstanding.
 */
export class PvcBindTimeoutSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(boundCount: number, totalCount: number, unboundNames: string[]) {
    super({
      message:
        `Timed out waiting for PersistentVolumeClaims to bind: ${boundCount} of ${totalCount} bound. ` +
        `Still unbound: ${unboundNames.join(', ')}`,
      code: ErrorCodeRegistry.PVC_BIND_TIMEOUT,
      troubleshootingSteps:
        'Inspect the outstanding claims: kubectl get pvc -n <namespace>\n' +
        'Check why a claim is not binding: kubectl describe pvc <name> -n <namespace>\n' +
        'Verify the storage provisioner is running: kubectl get pods -A | grep provisioner\n' +
        'Confirm the StorageClass exists and can provision: kubectl get storageclass\n' +
        'Raise the wait budget with PVC_BOUND_MAX_ATTEMPTS if provisioning is simply slow for this network size',
    });
  }
}
