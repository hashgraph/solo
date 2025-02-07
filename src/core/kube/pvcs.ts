/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from './namespace_name.js';

export interface Pvcs {
  /**
   * Delete a persistent volume claim
   * @param namespace - the namespace of the persistent volume claim to delete
   * @param name - the name of the persistent volume claim to delete
   * @returns true if the persistent volume claim was deleted
   */
  delete(namespace: NamespaceName, name: string): Promise<boolean>; // TODO was deletePvc

  /**
   * Get a list of persistent volume claim names for the given namespace
   * @param namespace - the namespace of the persistent volume claims to return
   * @param [labels] - labels
   * @returns list of persistent volume claim names
   */
  list(namespace: NamespaceName, labels: string[]): Promise<string[]>; // TODO was listPvcsByNamespace
}
