/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ContainerRef} from './container_ref.js';
import {type Container} from './container.js';

export interface Containers {
  byRef(containerRef: ContainerRef): Container;
}
