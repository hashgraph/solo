// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from './namespace-name.js';

export interface Namespaces {
  /**
   * Create a new namespace
   * @param namespace - the name of the namespace
   */
  create(namespace: NamespaceName): Promise<boolean>;

  /**
   * Delete a namespace
   * @param namespace - the name of the namespace
   */
  delete(namespace: NamespaceName): Promise<boolean>;

  /**
   * List all namespaces
   * @returns a list of namespace names
   * @throws SoloError if the response from the kubernetes API is incorrect
   */
  list(): Promise<NamespaceName[]>;

  /**
   * Check if a namespace exists
   * @param namespace - the name of the namespace
   * @returns true if the namespace exists
   */
  has(namespace: NamespaceName): Promise<boolean>;
}
