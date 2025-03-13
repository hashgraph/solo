// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from './spi/config_source.js';
import {type ConfigAccessor} from './spi/config_accessor.js';
import {type Refreshable} from './spi/refreshable.js';

/**
 * Represents a single application wide multi-layer configuration.
 */
export interface Config extends ConfigAccessor, Refreshable {
  /**
   * All the configuration sources which were used to build this configuration.
   */
  readonly sources: ConfigSource[];
}
