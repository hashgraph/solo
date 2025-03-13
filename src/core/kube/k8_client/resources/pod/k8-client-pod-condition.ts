// SPDX-License-Identifier: Apache-2.0

import {type PodCondition} from '../../../resources/pod/pod_condition.js';

export class K8ClientPodCondition implements PodCondition {
  constructor(
    public readonly type: string,
    public readonly status: string,
  ) {}
}
