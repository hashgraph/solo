// SPDX-License-Identifier: Apache-2.0

import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';

/**
 * Implementations of config accessor provide the necessary methods to access configuration properties.
 */
export interface ConfigAccessor {
  /**
   * Enumerates the set of property names that are available in the configuration source.
   *
   * @returns A set of property names that are available in the configuration source.
   */
  propertyNames(): Set<string>;

  /**
   * Enumerates the key-value pairs that are available in the configuration source.
   *
   * @returns A map of key-value pairs that are available in the configuration source.
   */
  properties(): Map<string, string>;

  /**
   * Retrieves the value of the specified key from the configuration source and converts it an object of the specified
   * type. If the key is not specified, the method returns the entire configuration as an object.
   *
   * @param cls - The class of the object to which the value should be converted.
   * @param key - The key to use to retrieve the value from the configuration source.
   * @returns The value of the specified key as a boolean.
   */
  asObject<T>(cls: ClassConstructor<T>, key?: string): T;

  /**
   * Retrieves the value of the specified key from the configuration source and converts it to an array of objects of
   * the specified type. If the key is not specified, the method returns the entire configuration as an array of objects.
   *
   * @param cls - The class of the objects to which the values should be converted.
   * @param key - The key to use to retrieve the values from the configuration source.
   */
  asObjectArray<T extends Array<T>>(cls: ClassConstructor<T>, key?: string): T[];

  /**
   * Retrieves the value of the specified key from the configuration source and converts it to a boolean.
   *
   * @param key - The key to use to retrieve the value from the configuration source.
   * @returns The value of the specified key as a boolean.
   */
  asBoolean(key: string): boolean | null;

  /**
   * Retrieves the value of the specified key from the configuration source and converts it to a number.
   *
   * @param key - The key to use to retrieve the value from the configuration source.
   * @returns The value of the specified key as a number.
   */
  asNumber(key: string): number | null;

  /**
   * Retrieves the value of the specified key from the configuration source and converts it to a string.
   *
   * @param key - The key to use to retrieve the value from the configuration source.
   * @returns The value of the specified key as a string.
   */
  asString(key: string): string | null;

  /**
   * Retrieves the value of the specified key from the configuration source and converts it to a string array.
   *
   * @param key - The key to use to retrieve the value from the configuration source.
   * @returns The value of the specified key as a string array.
   */
  asStringArray(key: string): string[] | null;
}
