/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from './namespace_name.js';

export interface K8Factory {
  /**
   * Create a namespace name. A Kubernetes namespace name must be a valid DNS 1123 label.
   *
   * @include DNS_1123_LABEL
   * @param name - the name of the namespace.
   * @returns an instance of NamespaceName.
   * @throws NamespaceNameInvalidError if the namespace name is invalid.
   */
  createNamespaceName(name: string): NamespaceName;
}
