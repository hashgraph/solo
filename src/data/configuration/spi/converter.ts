// SPDX-License-Identifier: Apache-2.0

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
}
