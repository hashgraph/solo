/**
 * SPDX-License-Identifier: Apache-2.0
 */
export interface Clusters {
  /**
   * Returns a list of clusters that are in the kubeconfig file
   * @returns a list of cluster names
   */
  list(): string[];

  /**
   * Returns the current cluster name as defined in the kubeconfig file
   * @returns the current cluster name
   */
  readCurrent(): string;
}
