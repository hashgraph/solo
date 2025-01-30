/**
 * SPDX-License-Identifier: Apache-2.0
 */
export default interface Contexts {
  list(): Promise<string[]>; // TODO was getContextNames
  readCurrent(): Promise<string>; // TODO was getCurrentContext
  readCurrentNamespace(): Promise<string>; // TODO was getCurrentContextNamespace
  updateCurrent(): Promise<void>; // TODO delete this once we are instantiating multiple K8 instances, was setCurrentContext
  testContextConnection(context: string): Promise<boolean>;
}
