/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {ResourceName} from '../resource_name.js';
import {ResourceType} from '../resource_type.js';

/**
 * Represents a Kubernetes pod name. A Kubernetes pod name must be a valid RFC-1123 DNS label.
 *
 * @include DNS_1123_LABEL
 */
export class PodName extends ResourceName {
  private constructor(name: string) {
    super(ResourceType.POD, name);
  }

  /**
   * Creates a pod. A Kubernetes pod name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @param name The name of the pod.
   * @returns An instance of PodName.
   * @throws InvalidResourceNameError if the pod name is invalid.
   */
  public static of(name: string): PodName {
    return new PodName(name);
  }
}
