// SPDX-License-Identifier: Apache-2.0

import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';
import {type Primitive} from '../../../business/utils/primitive.js';
import {type PrimitiveArray} from '../../../business/utils/primitive-array.js';

/**
 * The ObjectMapper interface defines the methods for converting between plain javascript objects and class instances.
 *
 * This is an abstraction that allows the data layer to be decoupled from the underlying object mapper implementation.
 */
export interface ObjectMapper {
  /**
   * Converts a plain javascript object into an instance of the specified class.
   *
   * @param cls - The desired class of the resulting object instance.
   * @param obj - The plain javascript object to be converted.
   * @throws ObjectMappingError if the mapping or a type conversion fails.
   */
  fromObject<T>(cls: ClassConstructor<T>, obj: object): T;

  /**
   * Converts an instance of a class into a plain javascript object.
   *
   * @param data - The object instance to be converted.
   * @throws ObjectMappingError if the mapping or a type conversion fails.
   */
  toObject<T>(data: T): object;

  /**
   * Converts an array of plain javascript objects into an array of instances of the specified class.
   *
   * @param cls - The desired class of the resulting object instances.
   * @param arr - The array of plain javascript objects to be converted.
   * @throws ObjectMappingError if the mapping or a type conversion fails.
   */
  fromArray<T>(cls: ClassConstructor<T>, arr: object[]): T[];

  /**
   * Converts an array of instances of a class into an array of plain javascript objects.
   *
   * @param data - The array of object instances to be converted.
   * @throws ObjectMappingError if the mapping or a type conversion fails.
   */
  toArray<T>(data: T[]): object[];

  /**
   * Converts a plain javascript object into a flat Map of key-value pairs.
   *
   * @param data - The plain javascript object to be converted.
   * @returns A Map of key-value pairs.
   */
  toFlatKeyMap(data: object): Map<string, string>;

  /**
   * Sets the value of a property on an object hierarchy as specified by the key.
   *
   * @param obj - The object on which to set the property value.
   * @param key - The key specifying the property to set.
   * @param value - The value to set.
   */
  applyPropertyValue(obj: object, key: string, value: Primitive | PrimitiveArray | object | object[]): void;
}
