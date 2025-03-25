// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './solo-error.js';

export class SilentBreak extends SoloError {
  /**
   * A silent break does not display a message to the user
   *
   * @param message - break message
   */
  constructor(message: string) {
    super(message);
  }
}
