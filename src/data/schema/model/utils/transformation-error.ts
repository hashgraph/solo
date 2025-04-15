// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../../core/errors/solo-error.js';

export class TransformationError extends SoloError {
  public constructor(
    public override readonly message: string,
    public override readonly cause: Error | unknown = null,
    public override readonly meta: unknown = {},
  ) {
    super(message, cause, meta);
    this.name = 'TransformationError';
  }
}
