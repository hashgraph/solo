/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {ResourceName} from '../resource_name.js';
import {ResourceType} from '../resource_type.js';

/**
 * Represents a Kubernetes container name. A Kubernetes container name must be a valid RFC-1123 DNS label.
 *
 * @include DNS_1123_LABEL
 */
export class ContainerName extends ResourceName {
  private constructor(name: string) {
    super(ResourceType.CONTAINER, name);
  }

  /**
   * Creates a container. A Kubernetes container name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @param name The name of the container.
   * @returns An instance of ContainerName.
   * @throws ContainerNameInvalidError if the container name is invalid.
   */
  public static of(name: string): ContainerName {
    return new ContainerName(name);
  }
}
