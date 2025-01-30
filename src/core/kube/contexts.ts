/**
 * SPDX-License-Identifier: Apache-2.0
 */
export default interface Contexts {
  /**
   * List all contexts in the kubeconfig
   * @returns a list of context names
   */
  list(): Promise<string[]>; // TODO was getContextNames

  /**
   * Read the current context in the kubeconfig
   * @returns the current context name
   */
  readCurrent(): Promise<string>; // TODO was getCurrentContext

  /**
   * Read the current namespace in the kubeconfig
   * @returns the current namespace name
   */
  readCurrentNamespace(): Promise<string>; // TODO was getCurrentContextNamespace

  /**
   * Set the current context in the kubeconfig
   * @param context - the context name to set
   */
  updateCurrent(context: string): Promise<void>; // TODO delete this once we are instantiating multiple K8 instances, was setCurrentContext

  /**
   * Test the connection to a context
   * @param context - the context name to test
   * @returns true if the connection is successful
   */
  testContextConnection(context: string): Promise<boolean>;
}
