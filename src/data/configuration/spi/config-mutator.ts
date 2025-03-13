// SPDX-License-Identifier: Apache-2.0

import {type ConfigAccessor} from './config_accessor.js';

/**
 * Implementations of config mutator provide the necessary methods to access and modify a configuration.
 */
export interface ConfigMutator extends ConfigAccessor {
  /**
   * Puts a string value into the configuration.
   * @param key - The key to use to store the value in the configuration.
   * @param value - The value to store in the configuration.
   */
  putString(key: string, value: string): void;

  /**
   * Puts an array of string values into the configuration.
   * @param key - The key to use to store the values in the configuration.
   * @param value - The values to store in the configuration.
   */
  putStringArray(key: string, value: string[]): void;

  /**
   * Puts a number value into the configuration.
   * @param key - The key to use to store the value in the configuration.
   * @param value - The value to store in the configuration.
   */
  putNumber(key: string, value: number): void;

  /**
   * Puts a boolean value into the configuration.
   * @param key - The key to use to store the value in the configuration.
   * @param value - The value to store in the configuration.
   */
  putBoolean(key: string, value: boolean): void;

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
