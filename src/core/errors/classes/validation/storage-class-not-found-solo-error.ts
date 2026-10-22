// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a user-supplied StorageClass name does not exist in the cluster.
 */
export class StorageClassNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(storageClass: string, available: string) {
    super({
      message:
        `StorageClass '${storageClass}' not found in cluster.` +
        (available ? ` Available classes: ${available}` : ' No StorageClasses are installed.'),
      code: ErrorCodeRegistry.STORAGE_CLASS_NOT_FOUND,
      troubleshootingSteps:
        `Run 'kubectl get storageclass' to list StorageClasses available in the cluster.\n` +
        `Pass the correct name via: solo consensus network deploy --pvc-storage-class <name>\n` +
        `Omit --pvc-storage-class to let solo select or install a suitable StorageClass automatically.`,
    });
  }
}
