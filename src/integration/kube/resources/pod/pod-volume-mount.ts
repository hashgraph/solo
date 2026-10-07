// SPDX-License-Identifier: Apache-2.0

/**
 * A single PersistentVolumeClaim-backed volume mount of a pod: which claim backs it, which
 * container mounts it, and where. Used to verify that a claim is mounted on the storage it asked
 * for, which is not observable from the claim or the pod status alone.
 */
export interface PodVolumeMount {
  /** Name of the PersistentVolumeClaim backing the volume. */
  readonly claimName: string;

  /** Name of the pod volume (`pod.spec.volumes[].name`). */
  readonly volumeName: string;

  /** Name of the container that mounts the volume. */
  readonly containerName: string;

  /** Absolute path the volume is mounted on inside the container. */
  readonly mountPath: string;
}
