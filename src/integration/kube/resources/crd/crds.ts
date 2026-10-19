// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for custom resource definitions.
 */
export interface Crds {
  /**
   * Check if a CRD exists.
   * @param crdName The name of the CRD to check.
   * @returns True if the CRD exists, false otherwise.
   * @throws An error if an unexpected error occurs.
   **/
  ifExists(crdName: string): Promise<boolean>;

  /**
   * Read the labels of a CRD.
   * @param crdName The name of the CRD to read.
   * @returns The CRD's labels (empty object when it has none), or undefined when the CRD does not exist.
   * @throws An error if an unexpected error occurs.
   **/
  readLabels(crdName: string): Promise<Record<string, string> | undefined>;

  /**
   * Delete a CRD. A no-op when the CRD does not exist, so callers can use it to clean up after a release
   * they own without first checking whether the CRD is still there.
   * @param crdName The name of the CRD to delete.
   * @throws An error if an unexpected error occurs.
   **/
  delete(crdName: string): Promise<void>;
}
