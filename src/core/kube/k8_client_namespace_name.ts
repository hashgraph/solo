/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from './namespace_name.js';
import {NamespaceNameInvalidError} from './kube_errors.js';
import {isDns1123Label} from '../helpers.js';

export class K8ClientNamespaceName implements NamespaceName {
  constructor(public readonly name: string) {
    if (!this.isValid()) {
      throw new NamespaceNameInvalidError(NamespaceNameInvalidError.NAMESPACE_NAME_INVALID(name));
    }
  }

  public isValid(): boolean {
    return isDns1123Label(this.name);
  }
}

export class K8ClientNamespaceNameBuilder {
  public static build(name: string): NamespaceName {
    return new K8ClientNamespaceName(name);
  }
}
