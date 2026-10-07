// SPDX-License-Identifier: Apache-2.0

import {type PvcMountFindingKind} from './pvc-mount-finding-kind.js';

/**
 * One problem found while verifying that a pod's PersistentVolumeClaim mounts are backed by the
 * storage they asked for.
 */
export interface PvcMountFinding {
  readonly kind: PvcMountFindingKind;

  /** Name of the pod the finding applies to. */
  readonly podName: string;

  /** Name of the claim, or undefined for findings about the pod as a whole. */
  readonly claimName: string | undefined;

  /** Mount path inside the container, or undefined for findings about the pod as a whole. */
  readonly mountPath: string | undefined;

  /** Human-readable description of the problem, used in the warning or error message. */
  readonly description: string;
}
