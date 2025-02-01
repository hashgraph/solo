/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {NamespaceNameInvalidError} from './kube_errors.js';
import {isDns1123Label} from '../helpers.js';

/**
 * Represents a Kubernetes namespace name. A Kubernetes namespace name must
 * be a valid DNS 1123 label.
 *
 * @include DNS_1123_LABEL
 */
export class NamespaceName {
  private constructor(public readonly name: string) {
    if (!this.isValid()) {
      throw new NamespaceNameInvalidError(NamespaceNameInvalidError.NAMESPACE_NAME_INVALID(name));
    }
  }

  /**
   * Creates a namespace. A Kubernetes namespace name must be a valid DNS 1123 label.
   *
   * @include DNS_1123_LABEL
   * @param name The name of the namespace.
   */
  public static of(name: string): NamespaceName {
    return new NamespaceName(name);
  }

  /**
   * Returns true if the namespace name is valid.  A Kubernetes namespace name must be a valid DNS 1123 label.
   *
   * @include DNS_1123_LABEL
   *
   * @returns true if the namespace name is valid.
   * @throws NamespaceNameInvalidError if the namespace name is invalid.
   */
  public isValid(): boolean {
    return isDns1123Label(this.name);
  }
}
