// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './SoloError.js';

export class ResourceNotFoundError extends SoloError {
  /**
   * Create a custom error for resource not found scenario
   *
   * error metadata will include `resource`
   *
   * @param message - error message
   * @param resource - name of the resource
   * @param cause - source error (if any)
   */
  constructor(message: string, resource: string, cause: Error | any = {}) {
    super(message, cause, {resource});
  }
}
