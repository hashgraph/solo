// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeServiceLoadBalancerTimeoutError extends KubeError {
  public readonly namespace: string;
  public readonly labels: string[];

  public constructor(namespace: string, labels: string[]) {
    super(
      `Timed out waiting for a load balancer address to be assigned in namespace ${namespace} for labels [${labels.join(', ')}]`,
      undefined,
      {namespace, labels},
    );
    this.namespace = namespace;
    this.labels = labels;
  }
}
