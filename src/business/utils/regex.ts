// SPDX-License-Identifier: Apache-2.0

import {UnsupportedOperationError} from '../errors/unsupported-operation-error.js';

export class Regex {
  private constructor() {
    throw new UnsupportedOperationError('This class cannot be instantiated');
  }

  public static escape(string_: string): string {
    return string_.replaceAll(/[-/\\^$*+?.()|[\]{}]/g, String.raw`\$&`);
  }
}
