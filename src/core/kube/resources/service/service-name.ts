// SPDX-License-Identifier: Apache-2.0

import {ResourceName} from '../resource-name.js';
import {ResourceType} from '../resource-type.js';

/**
 * Represents a Kubernetes service name. A Kubernetes service name must be a valid RFC-1123 DNS label.
 *
 * @include DNS_1123_LABEL
 */
export class ServiceName extends ResourceName {
  private constructor(name: string) {
    super(ResourceType.SERVICE, name);
  }

  /**
   * Creates a service. A Kubernetes service name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @param name The name of the service.
   * @returns An instance of ServiceName.
   * @throws InvalidResourceNameError if the service name is invalid.
   */
  public static of(name: string): ServiceName {
    return new ServiceName(name);
  }
}
