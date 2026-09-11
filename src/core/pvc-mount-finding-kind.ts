// SPDX-License-Identifier: Apache-2.0

/**
 * The kinds of problem that PVC mount verification can detect. Both are silent in the Kubernetes
 * API: the claim binds, the pod runs, and no event is emitted.
 */
export enum PvcMountFindingKind {
  /**
   * The filesystem backing the mount is smaller than the claim requested. Provisioners that hand
   * out directories on an existing filesystem (hostPath, local-path) do not enforce the requested
   * size, so a claim can bind and mount against a disk far too small to hold it — for example when
   * the intended data mount point was never mounted and the path fell through to the system disk.
   */
  UnderProvisioned = 'under-provisioned',

  /** The pod has no claim-backed mounts at all, so all of its data is ephemeral. */
  NoPersistentStorage = 'no-persistent-storage',
}
