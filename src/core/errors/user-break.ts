// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './solo-error.js';

export class UserBreak extends SoloError {
  /**
   * Create a custom error for user break scenarios
   *
   * @param message - break message
   */
  constructor(message: string) {
    super(message);
  }
}
