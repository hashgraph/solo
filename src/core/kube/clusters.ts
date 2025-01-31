/**
 * SPDX-License-Identifier: Apache-2.0
 */
export default interface Clusters {
  /**
   * Returns a list of clusters that are in the kubeconfig file
   * @returns a list of cluster names
   */
  list(): Promise<string[]>; // TODO was getClusters

  /**
   * Returns the current cluster name as defined in the kubeconfig file
   * @returns the current cluster name
   */
  readCurrent(): Promise<string>; // TODO was getCurrentClusterName
}
