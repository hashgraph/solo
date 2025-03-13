// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './SoloError.js';

export class MissingArgumentError extends SoloError {
  /**
   * Create a custom error for missing argument scenario
   *
   * @param message - error message
   * @param cause - source error (if any)
   */
  constructor(message: string, cause: Error | any = {}) {
    super(message, cause);
  }
}
