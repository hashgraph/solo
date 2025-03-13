// SPDX-License-Identifier: Apache-2.0

/**
 * An exception thrown when parsing the output of a helm command fails.
 */
export class HelmParserException extends Error {
  /**
   * Constructs a new runtime exception with the specified detail message.
   * @param message The detail message
   */
  constructor(message: string);
  /**
   * Constructs a new runtime exception with the specified detail message and cause.
   * @param message The detail message
   * @param cause The cause
   */
  constructor(message: string, cause: Error);
  /**
   * Constructs a new runtime exception with the specified cause.
   * @param cause The cause
   */
  constructor(cause: Error);

  constructor(messageOrCause: string | Error, cause?: Error) {
    if (messageOrCause instanceof Error) {
      super(messageOrCause.message);
      this.cause = messageOrCause;
    } else {
      super(messageOrCause);
      if (cause) {
        this.cause = cause;
      }
    }
    this.name = 'HelmParserException';
  }

  cause?: Error;
}
