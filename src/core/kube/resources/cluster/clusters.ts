/**
 * SPDX-License-Identifier: Apache-2.0
 */
export interface Clusters {
  /**
   * Returns a list of clusters that are in the kubeconfig file
   * @returns a list of cluster names
   */
  list(): string[]; // TODO should this be removed and `solo cluster list` use local config cluster list?

  /**
   * Returns the current cluster name as defined in the kubeconfig file
   * @returns the current cluster name
   */
  readCurrent(): string; // TODO remove read current cluster, this should not be needed
}
