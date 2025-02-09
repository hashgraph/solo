/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type IngressClass} from './ingress_class.js';

export interface IngressClasses {
  /**
   * List all IngressClasses in the cluster.
   *
   * @returns a list of IngressClasses
   * @throws SoloError if failed to list IngressClasses
   */
  list(): Promise<IngressClass[]>;
}
