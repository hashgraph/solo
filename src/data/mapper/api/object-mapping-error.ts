// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';

/**
 * Thrown by an object mapper when an error occurs during the mapping process. Errors can occur when the object to be
 * mapped is not in the expected format or a type conversion fails.
 */
export class ObjectMappingError extends SoloError {
  constructor(message: string, cause?: Error, meta?: object) {
    super(message, cause, meta);
  }
}
