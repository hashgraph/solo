// SPDX-License-Identifier: Apache-2.0

import {type LoadBalancerIngress} from './load_balancer_ingress.js';

export interface LoadBalancerStatus {
  readonly ingress?: LoadBalancerIngress[];
}
