// SPDX-License-Identifier: Apache-2.0

import {type Containers} from '../../../resources/container/containers.js';
import {type ContainerReference} from '../../../resources/container/container-reference.js';
import {type Container} from '../../../resources/container/container.js';
import {K8ClientContainer} from './k8-client-container.js';
import {type KubeConfig} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';

export class K8ClientContainers implements Containers {
  public constructor(
    private readonly kubeConfig: KubeConfig,
    private readonly pods: Pods,
  ) {}

  public readByRef(containerReference: ContainerReference): Container {
    return new K8ClientContainer(this.kubeConfig, containerReference, this.pods);
  }
}
