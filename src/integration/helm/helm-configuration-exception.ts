// SPDX-License-Identifier: Apache-2.0

/**
 * Exception thrown when there is a configuration error in the Helm client.
 */
export class HelmConfigurationException extends Error {
  /**
   * Constructs a new exception instance with the specified message.
   *
   * @param message the detail message (which is saved for later retrieval by the getMessage() method).
   */
  constructor(message: string);

  /**
   * Constructs a new exception instance with the specified message and cause.
   *
   * @param message the detail message (which is saved for later retrieval by the getMessage() method).
   * @param cause   the cause (which is saved for later retrieval by the getCause() method).
   *                A null value is permitted, and indicates that the cause is nonexistent or unknown.
   */
  constructor(message: string, cause: Error);

  /**
   * Constructs a new exception instance with the specified cause.
   *
   * @param cause the cause (which is saved for later retrieval by the getCause() method).
   *              A null value is permitted, and indicates that the cause is nonexistent or unknown.
   */
  constructor(cause: Error);

  // Implementation
  constructor(messageOrCause?: string | Error, cause?: Error) {
    if (typeof messageOrCause === 'string') {
      super(messageOrCause);
      if (cause) {
        this.cause = cause;
      }
    } else if (messageOrCause instanceof Error) {
      super(messageOrCause.message);
      this.cause = messageOrCause;
    } else {
      super();
    }
    this.name = 'HelmConfigurationException';
  }

  override cause?: Error;
}
