// SPDX-License-Identifier: Apache-2.0

import {type ConfigBuilder} from './config-builder.js';
import {type Config} from './config.js';

/**
 * The ConfigProvider interface provides the ability to build, register, access, and release a Config instance.
 */
export interface ConfigProvider {
  /**
   * Retrieves the current configuration.
   *
   * @returns The current configuration.
   * @throws Error if the configuration has not been registered.
   */
  config(): Config;

  /**
   * Registers the specified configuration with the provider.
   *
   * @param config - The configuration to be registered.
   * @throws ConfigurationError if a configuration has already been registered.
   */
  register(config: Config): void;

  /**
   * Releases the configuration that is currently registered with the provider.
   *
   * @throws ConfigurationError if a configuration has not been registered.
   */
  release(): void;

  /**
   * Creates a new configuration instance. The configuration built by this builder is not registered with the provider
   * by the {@link ConfigBuilder#build} method. Callers should use the {@link ConfigProvider#register} method to register
   * the configuration with the provider.
   *
   * @returns A new configuration builder instance.
   */
  builder(): ConfigBuilder;
}
