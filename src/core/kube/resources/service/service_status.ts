/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type LoadBalancerStatus} from '../load_balancer_status.js';

export interface ServiceStatus {
  readonly loadBalancer?: LoadBalancerStatus;
}
