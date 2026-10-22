// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';

export interface Ingresses {
  /**
   * listForAllNamespaces lists all Ingresses in all namespaces.
   * @returns a list of Ingress names.
   * @throws ResourceReadError if the Ingresses could not be listed.
   */
  listForAllNamespaces(): Promise<string[]>;

  /**
   * Update the Ingresses of a release: every Ingress in the namespace whose name is `name` or starts with `name-`.
   * @param namespace - the namespace of the Ingress.
   * @param name - the name of the Ingress, or the name prefix shared by the Ingresses of a release.
   * @param patch - the patch to apply to the Ingress.
   * @throws SoloError if the Ingress could not be updated.
   * @throws ResourceUpdateError if the Ingress could not be updated.
   */
  update(namespace: NamespaceName, name: string, patch: object): Promise<void>;
}
