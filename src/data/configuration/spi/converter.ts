// SPDX-License-Identifier: Apache-2.0

import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';

/**
 * Adapter for handling conversion of strings to a given class instance type.
 */
export interface Converter<T> {
  /**
   * Converts the supplied value to an instance of the class.
   *
   * @param value - the supplied value.
   * @returns the class instance or a null reference.
   */
  convert(value: string): T | null;

  /**
   * Determines if the converter applies to the supplied class type.
   *
   * @param type - the class type to be checked.
   * @returns true if the converter applies to the class type, false otherwise.
   */
  appliesTo(type: ClassConstructor<T>): boolean;
}
