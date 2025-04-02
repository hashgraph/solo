// SPDX-License-Identifier: Apache-2.0

import {type ContainerReference} from './container-reference.js';
import {type Container} from './container.js';

export interface Containers {
  /**
   * Get a container by reference for running operations against
   * @param containerRef - the reference to the container
   * @returns a container object
   */
  readByRef(containerReference: ContainerReference): Container;
}
