// SPDX-License-Identifier: Apache-2.0

import {type ConfigAccessor} from './config-accessor.js';

/**
 * Implementations of config mutator provide the necessary methods to access and modify a configuration.
 */
export interface ConfigMutator extends ConfigAccessor {
  /**
   * Puts a scalar value into the configuration.
   *
   * @param key - The key to use to store the value in the configuration.
   * @param value - The value to store in the configuration.
   */
  putScalar(key: string, value: string | number | boolean): void;

  /**
   * Puts an array of string, boolean or numeric values into the configuration.
   * @param key - The key to use to store the values in the configuration.
   * @param value - The values to store in the configuration.
   */
  putScalarArray(key: string, value: string[] | number[] | boolean[]): void;

  /**
   * Puts an object value into the configuration.
   * @param key - The key to use to store the value in the configuration.
   * @param value - The value to store in the configuration.
   */
  putObject<T>(key: string, value: T): void;

  /**
   * Puts an array of object values into the configuration.
   * @param key - The key to use to store the values in the configuration.
   * @param value - The values to store in the configuration.
   */
  putObjectArray<T>(key: string, value: T[]): void;
}
