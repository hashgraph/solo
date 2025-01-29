/**
 * SPDX-License-Identifier: Apache-2.0
 */

export class SoloError extends Error {
  /**
   * Create a custom error object
   *
   * error metadata will include the `cause`
   *
   * @param message error message
   * @param cause source error (if any)
   * @param meta additional metadata (if any)
   */
  constructor(
    message: string,
    cause: Error | any = {},
    public meta: any = {},
  ) {
    super(message);
    this.name = this.constructor.name;

    if (cause) {
      this.cause = cause;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ResourceNotFoundError extends SoloError {
  /**
   * Create a custom error for resource not found scenario
   *
   * error metadata will include `resource`
   *
   * @param message - error message
   * @param resource - name of the resource
   * @param cause - source error (if any)
   */
  constructor(message: string, resource: string, cause: Error | any = {}) {
    super(message, cause, {resource});
  }
}

export class MissingArgumentError extends SoloError {
  /**
   * Create a custom error for missing argument scenario
   *
   * @param message - error message
   * @param cause - source error (if any)
   */
  constructor(message: string, cause: Error | any = {}) {
    super(message, cause);
  }
}

export class IllegalArgumentError extends SoloError {
  /**
   * Create a custom error for illegal argument scenario
   *
   * error metadata will include `value`
   *
   * @param message - error message
   * @param value - value of the invalid argument
   * @param cause - source error (if any)
   */
  constructor(message: string, value: any = '', cause: Error | any = {}) {
    super(message, cause, {value});
  }
}

export class DataValidationError extends SoloError {
  /**
   * Create a custom error for data validation error scenario
   *
   * error metadata will include `expected` and `found` values.
   *
   * @param message - error message
   * @param expected - expected value
   * @param found - value found
   * @param [cause] - source error (if any)
   */
  constructor(message: string, expected: any, found: any, cause: Error | any = {}) {
    super(message, cause, {expected, found});
  }
}
