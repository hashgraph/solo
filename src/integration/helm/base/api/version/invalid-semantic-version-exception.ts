// SPDX-License-Identifier: Apache-2.0

/**
 * Exception thrown when a version string cannot be parsed as a semantic version number.
 */
export class InvalidSemanticVersionException extends Error {
  /**
   * The cause of this exception.
   */
  public override cause?: Error;

  /**
   * Constructs a new instance of an {@link InvalidSemanticVersionException}.
   *
   * @param message optional message to associate with this exception.
   * @param cause optional cause of this exception.
   */
  constructor(message?: string, cause?: Error) {
    super(message);
    if (cause) {
      this.cause = cause;
    }
    this.name = 'InvalidSemanticVersionException';
  }
}
