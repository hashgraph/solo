// SPDX-License-Identifier: Apache-2.0

import {UnsupportedOperationError} from '../../business/errors/unsupported-operation-error.js';

export class KeyName {
  private constructor() {
    throw new UnsupportedOperationError('This class cannot be instantiated');
  }

  public static isArraySegment(segment: string): boolean {
    return segment && segment?.match(/^[0-9]+$/g)?.length > 0;
  }
}
