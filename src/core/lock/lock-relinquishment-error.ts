// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../errors/SoloError.js';

export class LockRelinquishmentError extends SoloError {
  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param message - the error message to be reported.
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(message: string, cause: Error | any = {}, meta: any = {}) {
    super(message, cause, meta);
  }
}
