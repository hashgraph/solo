// SPDX-License-Identifier: Apache-2.0

/**
 * An exception thrown when parsing the output of a helm command fails.
 */
export class HelmParserException extends Error {
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
}
