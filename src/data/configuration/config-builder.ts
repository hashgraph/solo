// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from './spi/config_source.js';
import {type Config} from './config.js';
import {type Converter} from './spi/converter.js';
import {type ClassConstructor} from '../../business/utils/class_constructor.type.js';

/**
 * Fluent builder for creating a Config instance.
 */
export interface ConfigBuilder {
  /**
   * Adds the default configuration sources to the configuration.
   */
  addDefaultSources(): ConfigBuilder;

  /**
   * Adds the default configuration converters to the configuration.
   */
  addDefaultConverters(): ConfigBuilder;

  /**
   * Adds the specified configuration sources to the configuration.
   *
   * @param sources - The configuration sources to be added.
   */
  withSources(...sources: ConfigSource[]): ConfigBuilder;

  /**
   * Adds the specified configuration converters to the configuration.
   *
   * @param cls - The class of the configuration to which the value should be converted.
   * @param priority - The priority of the configuration converter.
   * @param converter - The configuration converter to be added.
   */
  withConverter<T>(cls: ClassConstructor<T>, priority: number, converter: Converter<T>): ConfigBuilder;

  /**
   * Builds a {@link Config} instance.
   */
  build(): Config;
}
