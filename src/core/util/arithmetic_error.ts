/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

/**
 * Thrown when an arithmetic operation fails due to NaN, Infinity, Division by Zero, or other arithmetic errors.
 */
export class ArithmeticError extends Error {
  /**
   * Constructs a new `ArithmeticError` instance.
   *
   * @param message - The error message.
   * @param cause - The nest error (if any).
   */
  constructor(message: string, cause: Error | any = {}) {
    super(message);
    this.name = this.constructor.name;

    if (cause) {
      this.cause = cause;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}
