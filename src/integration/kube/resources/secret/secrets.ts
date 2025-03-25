// SPDX-License-Identifier: Apache-2.0

import {type Optional} from '../../../../types/index.js';
import {type NamespaceName} from '../namespace/namespace-name.js';
import {type SecretType} from './secret-type.js';

export interface Secrets {
  /**
   * creates a new Kubernetes secret with the provided attributes
   * @param namespace - the namespace to store the secret
   * @param name - the name of the new secret
   * @param secretType - the secret type
   * @param data - the secret, any values of a key:value pair must be base64 encoded
   * @param labels - the label to use for future label selector queries
   * @returns whether the secret was created successfully
   */
  create(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean>;

  createOrReplace(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean>;

  replace(
    namespace: NamespaceName,
    name: string,
    secretType: SecretType,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
  ): Promise<boolean>;

  read(
    namespace: NamespaceName,
    name: string,
  ): Promise<{
    data: Record<string, string>;
    name: string;
    namespace: string;
    type: string;
    labels: Record<string, string>;
  }>;

  /**
   * Delete a secret from the namespace
   * @param namespace - the namespace to store the secret
   * @param name - the name of the existing secret
   * @returns whether the secret was deleted successfully
   */
  delete(namespace: NamespaceName, name: string): Promise<boolean>;

  /**
   * Get secrets by labels
   * @param namespace - the namespace of the secret
   * @param labels - list of labels
   * @returns the list of secrets that match the labels
   */
  list(
    namespace: NamespaceName,
    labels?: string[],
  ): Promise<
    Array<{
      data: Record<string, string>;
      name: string;
      namespace: string;
      type: string;
      labels: Record<string, string>;
    }>
  >;

  exists(namespace: NamespaceName, name: string): Promise<boolean>;
}
