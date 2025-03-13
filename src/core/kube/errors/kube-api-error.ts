// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';

export class KubeApiError extends SoloError {
  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param message - the error message.
   * @param statusCode - the HTTP status code.
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(message: string, statusCode: number, cause?: Error, meta?: object) {
    super(message + `, statusCode: ${statusCode}`, cause, {...meta, ...{statusCode: statusCode}});
  }
}
