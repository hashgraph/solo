/**
 * SPDX-License-Identifier: Apache-2.0
 */
export interface DataObject<T> {
  /**
   * Compares two LocalConfig objects for equality.
   * @param other The LocalConfig object to compare against
   * @returns boolean - true if the LocalConfig objects are equal; false otherwise
   */
  equals(other: T): boolean;

  /**
   * Returns a plain object representation of this LocalConfig.
   * @returns object - a plain object representation of this LocalConfig instance
   */
  toObject(): object;

  /**
   * Returns a string representation of this LocalConfig instance.
   * @returns string - a string representation of this LocalConfig instance
   */
  toString(): string;
}
