// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';

export class MissingResourceNameError extends SoloError {
  public static MISSING_RESOURCE_NAME = 'Name is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error, meta?: object) {
    super(MissingResourceNameError.MISSING_RESOURCE_NAME, cause, meta);
  }
}
