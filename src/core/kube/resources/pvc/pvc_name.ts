/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {ResourceName} from '../../resources/resource_name.js';
import {ResourceType} from '../../resources/resource_type.js';

/**
 * Represents a Kubernetes PVC (persistent volume claim) name. A Kubernetes PVC name must be a valid RFC-1123 DNS label.
 *
 * @include DNS_1123_LABEL
 */
export class PvcName extends ResourceName {
  private constructor(name: string) {
    super(ResourceType.PERSISTENT_VOLUME_CLAIM, name);
  }

  /**
   * Creates a PVC (persistent volume claim). A Kubernetes PVC name must be a valid RFC-1123 DNS label.
   *
   * @include DNS_1123_LABEL
   *
   * @param name The name of the PVC (persistent volume claim).
   * @returns An instance of PvcName.
   * @throws InvalidResourceNameError if the PVC (persistent volume claim) name is invalid.
   */
  public static of(name: string): PvcName {
    return new PvcName(name);
  }
}
