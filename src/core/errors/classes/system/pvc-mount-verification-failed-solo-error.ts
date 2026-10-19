// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when PVC mount verification finds that a pod's PersistentVolumeClaim mounts
 * are not backed by the storage the claims requested, and verification was configured to fail
 * rather than warn. Provisioners that hand out directories on an existing filesystem do not enforce
 * the requested size, so this condition is invisible to Kubernetes: the claim binds, the pod runs,
 * and the shortfall only surfaces later as a full disk. The usual cause is that the directory tree
 * the provisioner writes into is not the mount point it was meant to be — a data array that failed
 * to mount at boot leaves the path on the system disk instead.
 */
export class PvcMountVerificationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(findings: string[]) {
    super({
      message: `PVC mount verification failed:\n${findings.map((finding: string): string => `  - ${finding}`).join('\n')}`,
      code: ErrorCodeRegistry.PVC_MOUNT_VERIFICATION_FAILED,
      troubleshootingSteps:
        'Check what the claims bound to and how large they really are: kubectl get pvc,pv -n <namespace>\n' +
        'Identify the provisioner and the host directory it writes into: kubectl get storageclass -o yaml\n' +
        'On the node, confirm that directory is on the intended device and not the system disk: df -h <path>; lsblk; findmnt <path>\n' +
        'If an intended data array or disk failed to mount at boot, mount it and redeploy so the claims are provisioned onto it\n' +
        'To deploy anyway and only warn, omit --verify-pvc-mounts',
    });
  }
}
