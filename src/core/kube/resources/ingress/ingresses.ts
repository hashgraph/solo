/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from '../namespace/namespace_name.js';

export interface Ingresses {
  /**
   * listForAllNamespaces lists all Ingresses in all namespaces.
   * @returns a list of Ingress names.
   * @throws ResourceReadError if the Ingresses could not be listed.
   */
  listForAllNamespaces(): Promise<string[]>;

  /**
   * Update an existing Ingress.
   * @param namespace - the namespace of the Ingress.
   * @param name - the name of the Ingress.
   * @param patch - the patch to apply to the Ingress.
   * @throws SoloError if the Ingress could not be updated.
   * @throws ResourceUpdateError if the Ingress could not be updated.
   */
  update(namespace: NamespaceName, name: string, patch: object): Promise<void>;
}
