// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';

export class MissingParentResourceRefError extends SoloError {
  public static MISSING_PARENT_RESOURCE_REF = 'The parent ResourceRef is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error, meta?: object) {
    super(MissingParentResourceRefError.MISSING_PARENT_RESOURCE_REF, cause, meta);
  }
}
