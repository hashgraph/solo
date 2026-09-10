// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './solo-error.js';

export class SilentBreak extends SoloError {
  /**
   * A silent break does not display a message to the user
   *
   * @param message - break message
   * @param cause - the error this break stands in for, kept so callers that inspect the chain still
   *   reach its code, remediation and original stack. `ErrorHandler.extractBreak` tests the top-level
   *   instance first, so carrying a cause does not change the short-circuit behaviour.
   */
  public constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}
