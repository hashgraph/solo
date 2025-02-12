/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ContainerRef} from './container_ref.js';
import {type Container} from './container.js';

export interface Containers {
  /**
   * Get a container by reference for running operations against
   * @param containerRef - the reference to the container
   * @returns a container object
   */
  readByRef(containerRef: ContainerRef): Container;
}
