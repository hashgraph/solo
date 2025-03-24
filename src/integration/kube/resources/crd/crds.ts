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
}
