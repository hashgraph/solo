// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';

/**
 * General purpose error for configuration failures.
 */
export class ConfigurationError extends SoloError {
  public constructor(message: string, cause?: Error, meta?: object) {
    super(message, cause, meta);
  }
}
