// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from './namespace/namespace_name.js';
import {type ResourceName} from './resource_name.js';
import {MissingNamespaceError} from '../errors/missing_namespace_error.js';
import {MissingResourceNameError} from '../errors/missing_resource_name_error.js';

export abstract class ResourceRef<T extends ResourceName> {
  protected constructor(
    public readonly namespace: NamespaceName,
    public readonly name: T,
  ) {
    if (!namespace) {
      throw new MissingNamespaceError();
    }
    if (!name) {
      throw new MissingResourceNameError();
    }
  }

  /**
   * Compares this instance with another PodRef.
   * @param other The other PodRef instance.
   * @returns true if both instances have the same namespace name and pod name.
   */
  public equals(other: ResourceRef<T>): boolean {
    return other instanceof ResourceRef && this.namespace.equals(other.namespace) && this.name.equals(other.name);
  }

  /**
   * Allows implicit conversion to a string.
   * @returns The pod reference as a string.
   */
  public toString(): string {
    return `${this.namespace}/${this.name}`;
  }
}
