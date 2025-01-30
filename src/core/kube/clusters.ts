/**
 * SPDX-License-Identifier: Apache-2.0
 */
export default interface Clusters {
  list(): Promise<string[]>; // TODO was getClusters
  readCurrent(): Promise<string>; // TODO was getCurrentClusterName
}
