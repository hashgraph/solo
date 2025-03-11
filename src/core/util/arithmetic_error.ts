// SPDX-License-Identifier: Apache-2.0

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
