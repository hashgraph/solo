// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../../core/errors/solo-error.js';

export class SchemaMigrationError extends SoloError {
  public constructor(message: string, cause?: Error, meta?: object) {
    super(message, cause, meta);
  }
}
