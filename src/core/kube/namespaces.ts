/**
 * SPDX-License-Identifier: Apache-2.0
 */
export interface Namespaces {
  /**
   * Create a new namespace
   * @param namespace - the name of the namespace
   */
  create(namespace: string): Promise<boolean>; // TODO was createNamespace

  /**
   * Delete a namespace
   * @param namespace - the name of the namespace
   */
  delete(namespace: string): Promise<boolean>; // TODO was deleteNamespace

  /**
   * List all namespaces
   * @returns a list of namespace names
   */
  list(): Promise<string[]>; // TODO was getNamespaces

  /**
   * Check if a namespace exists
   * @param namespace - the name of the namespace
   * @returns true if the namespace exists
   */
  has(namespace: string): Promise<boolean>; // TODO was hasNamespace
}
