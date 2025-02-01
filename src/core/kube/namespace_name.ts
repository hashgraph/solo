/**
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Represents a Kubernetes namespace name. A Kubernetes namespace name must
 * be a valid DNS 1123 label.
 *
 * @include DNS_1123_LABEL
 */
export interface NamespaceName {
  /**
   * The name of the namespace. A Kubernetes namespace name must be a valid DNS 1123 label.
   *
   * @include DNS_1123_LABEL
   */
  readonly name: string;

  /**
   * Returns true if the namespace name is valid.  A Kubernetes namespace name must be a valid DNS 1123 label.
   *
   * @include DNS_1123_LABEL
   *
   * @returns true if the namespace name is valid.
   * @throws NamespaceNameInvalidError if the namespace name is invalid.
   */
  isValid(): boolean;
}
