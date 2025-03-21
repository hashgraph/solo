// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../../core/errors/solo-error.js';

export class TransformationError extends SoloError {
  public constructor(
    public readonly message: string,
    public readonly cause: Error | unknown = null,
    public readonly meta: unknown = {},
  ) {
    super(message, cause, meta);
    this.name = 'TransformationError';
  }
}
