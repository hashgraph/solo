/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Containers} from '../containers.js';
import {type ContainerRef} from '../container_ref.js';
import {type Container} from '../container.js';
import {K8ClientContainer} from './k8_client_container.js';
import {type KubeConfig} from '@kubernetes/client-node';

/**
 * SPDX-License-Identifier: Apache-2.0
 */
export class K8ClientContainers implements Containers {
  constructor(private readonly kubeConfig: KubeConfig) {}

  readByRef(containerRef: ContainerRef): Container {
    return new K8ClientContainer(this.kubeConfig, containerRef);
  }
}
