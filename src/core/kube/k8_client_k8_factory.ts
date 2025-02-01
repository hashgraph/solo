/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type K8Factory} from './k8_factory.js';
import {type NamespaceName} from './namespace_name.js';
import {K8ClientNamespaceNameBuilder} from './k8_client_namespace_name.js';

export class K8ClientK8Factory implements K8Factory {
  constructor() {}

  /**
   * Create a namespace name. A Kubernetes namespace name must be a valid DNS 1123 label.
   *
   * @include DNS_1123_LABEL
   * @param name - the name of the namespace.
   * @throws NamespaceNameInvalidError if the namespace name is invalid.
   */
  createNamespaceName(name: string): NamespaceName {
    return K8ClientNamespaceNameBuilder.build(name);
  }
}
