// SPDX-License-Identifier: Apache-2.0

/**
 * StorageClass represents a Kubernetes StorageClass.
 */
export interface StorageClass {
  /**
   * Name of the StorageClass.
   */
  readonly name: string;

  /**
   * The provisioner that handles this StorageClass (e.g. rancher.io/local-path).
   */
  readonly provisioner: string;

  /**
   * Whether this StorageClass is the cluster default
   * (annotated with storageclass.kubernetes.io/is-default-class=true).
   */
  readonly isDefault: boolean;

  /**
   * When volumes of this class are bound, e.g. `Immediate` or `WaitForFirstConsumer`. With `WaitForFirstConsumer`
   * provisioning happens as part of scheduling the consuming pod, so a stalled provisioner leaves that pod unscheduled.
   */
  readonly volumeBindingMode?: string;

  /**
   * What happens to the underlying volume when its claim is deleted, e.g. `Delete` or `Retain`. `Retain` leaves
   * volumes (and their data) behind between deployments.
   */
  readonly reclaimPolicy?: string;

  /**
   * Whether claims of this class can be grown after creation.
   */
  readonly allowVolumeExpansion?: boolean;

  /**
   * The names of the provisioner-specific settings this class defines, e.g. the backing disk type. Only the names are
   * kept: the values are provisioner-defined and some drivers accept credentials there, so they are discarded when
   * reading the class rather than carried somewhere they could be logged.
   */
  readonly parameterKeys?: string[];

  /**
   * Mount options applied to volumes of this class.
   */
  readonly mountOptions?: string[];

  /**
   * Node label keys this class restricts provisioning to, when `allowedTopologies` is set. A restriction that does
   * not overlap with where the pod may run leaves the volume unprovisionable and the pod unscheduled.
   */
  readonly allowedTopologyKeys?: string[];
}
