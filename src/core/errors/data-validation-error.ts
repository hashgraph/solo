// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './solo-error.js';

export class DataValidationError extends SoloError {
  /**
   * Create a custom error for data validation error scenario
   *
   * error metadata will include `expected` and `found` values.
   *
   * @param message - error message
   * @param expected - expected value
   * @param found - value found
   * @param [cause] - source error (if any)
   */
  constructor(message: string, expected: any, found: any, cause: Error | any = {}) {
    super(message, cause, {expected, found});
  }
}
