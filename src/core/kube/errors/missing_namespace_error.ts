/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {SoloError} from '../../errors.js';

export class MissingNamespaceError extends SoloError {
  public static MISSING_NAMESPACE = 'Namespace is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause?: Error, meta?: object) {
    super(MissingNamespaceError.MISSING_NAMESPACE, cause, meta);
  }
}
