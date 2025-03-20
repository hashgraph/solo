// SPDX-License-Identifier: Apache-2.0

import {type LoadBalancerStatus} from '../load-balancer-status.js';

export interface ServiceStatus {
  readonly loadBalancer?: LoadBalancerStatus;
}
