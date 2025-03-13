// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './solo-error.js';

export class IllegalArgumentError extends SoloError {
  /**
   * Create a custom error for illegal argument scenario
   *
   * error metadata will include `value`
   *
   * @param message - error message
   * @param value - value of the invalid argument
   * @param cause - source error (if any)
   */
  constructor(message: string, value: any = '', cause: Error | any = {}) {
    super(message, cause, {value});
  }
}
