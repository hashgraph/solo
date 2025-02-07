/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Optional} from '../../types/index.js';
import {type NamespaceName} from './namespace_name.js';

export interface Secrets {
  /**
   * creates a new Kubernetes secret with the provided attributes
   * @param namespace - the namespace to store the secret
   * @param name - the name of the new secret
   * @param secretType - the secret type
   * @param data - the secret, any values of a key:value pair must be base64 encoded
   * @param labels - the label to use for future label selector queries
   * @param recreate - if we should first run delete in the case that there the secret exists from a previous install
   * @returns whether the secret was created successfully
   */
  create(
    namespace: NamespaceName,
    name: string,
    secretType: string,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
    recreate: boolean,
  ): Promise<boolean>; // TODO was createSecret

  /**
   * Delete a secret from the namespace
   * @param namespace - the namespace to store the secret
   * @param name - the name of the existing secret
   * @returns whether the secret was deleted successfully
   */
  delete(namespace: NamespaceName, name: string): Promise<boolean>; // TODO was deleteSecret

  /**
   * Get secrets by labels
   * @param namespace - the namespace of the secret
   * @param labels - list of labels
   * @returns the list of secrets that match the labels
   */
  listByLabel(namespace: NamespaceName, labels: string[]): Promise<any>; // TODO was getSecretsByLabel(labels: string[]): Promise<any>
  // TODO consolidate getSecret into listByLabel
  // TODO consolidate listSecretsByNamespace into listByLabel
}
