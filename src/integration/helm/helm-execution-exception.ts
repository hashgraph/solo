// SPDX-License-Identifier: Apache-2.0

/**
 * Exception thrown when the execution of the Helm executable fails.
 */
export class HelmExecutionException extends Error {
  /**
   * The default message to use when no message is provided
   */
  private static readonly DEFAULT_MESSAGE = 'Execution of the Helm command failed with exit code: %d';

  /**
   * The non-zero system exit code returned by the Helm executable or the operating system
   */
  private readonly exitCode: number;

  /**
   * The standard output of the Helm executable
   */
  private readonly stdOut: string;

  /**
   * The standard error of the Helm executable
   */
  private readonly stdErr: string;

  /**
   * Constructs a new exception instance with the specified exit code and a default message.
   * @param exitCode The exit code returned by the Helm executable or the operating system
   */
  constructor(exitCode: number);
  /**
   * Constructs a new exception instance with the specified exit code, standard output and standard error.
   * @param exitCode The exit code returned by the Helm executable or the operating system
   * @param stdOut The standard output of the Helm executable
   * @param stdErr The standard error of the Helm executable
   */
  constructor(exitCode: number, stdOut: string, stdError: string);
  /**
   * Constructs a new exception instance with the specified exit code, message, stdOut, and stdErr.
   * @param exitCode The exit code returned by the Helm executable or the operating system
   * @param message The detail message
   * @param stdOut The standard output of the Helm executable
   * @param stdErr The standard error of the Helm executable
   */
  constructor(exitCode: number, message: string, stdOut: string, stdError: string);
  /**
   * Constructs a new exception instance with the specified exit code and cause using the default message.
   * @param exitCode The exit code returned by the Helm executable or the operating system
   * @param cause The cause
   */
  constructor(exitCode: number, cause: Error);
  /**
   * Constructs a new exception instance with the specified exit code, message and cause.
   * @param exitCode The exit code returned by the Helm executable or the operating system
   * @param message The detail message
   * @param cause The cause
   */
  constructor(exitCode: number, message: string, cause: Error);

  constructor(
    exitCode: number,
    messageOrStdOutOrCause?: string | Error,
    stdErrorOrCause?: string | Error,
    stdErrorParameter?: string,
  ) {
    let message: string;
    let cause: Error | undefined;
    let stdOut = '';
    let stdError = '';

    if (messageOrStdOutOrCause instanceof Error) {
      // Constructor with exitCode and cause
      message = HelmExecutionException.DEFAULT_MESSAGE.replace('%d', exitCode.toString());
      cause = messageOrStdOutOrCause;
    } else if (typeof messageOrStdOutOrCause === 'string') {
      if (stdErrorOrCause instanceof Error) {
        // Constructor with exitCode, message, and cause
        message = messageOrStdOutOrCause;
        cause = stdErrorOrCause;
      } else if (typeof stdErrorOrCause === 'string') {
        if (stdErrorParameter) {
          // Constructor with exitCode, message, stdOut, and stdErr
          message = messageOrStdOutOrCause;
          stdOut = stdErrorOrCause;
          stdError = stdErrorParameter;
        } else {
          // Constructor with exitCode, stdOut, and stdErr
          message = HelmExecutionException.DEFAULT_MESSAGE.replace('%d', exitCode.toString());
          stdOut = messageOrStdOutOrCause;
          stdError = stdErrorOrCause;
        }
      } else {
        // Constructor with just exitCode
        message = HelmExecutionException.DEFAULT_MESSAGE.replace('%d', exitCode.toString());
      }
    } else {
      // Constructor with just exitCode
      message = HelmExecutionException.DEFAULT_MESSAGE.replace('%d', exitCode.toString());
    }

    super(message);
    this.name = 'HelmExecutionException';
    this.exitCode = exitCode;
    this.stdOut = stdOut;
    this.stdErr = stdError;
    if (cause) {
      this.cause = cause;
    }
  }

  /**
   * Returns the exit code returned by the Helm executable or the operating system.
   * @returns The exit code returned by the Helm executable or the operating system
   */
  getExitCode(): number {
    return this.exitCode;
  }

  /**
   * Returns the standard output of the Helm executable.
   * @returns The standard output of the Helm executable
   */
  getStdOut(): string {
    return this.stdOut;
  }

  /**
   * Returns the standard error of the Helm executable.
   * @returns The standard error of the Helm executable
   */
  getStdErr(): string {
    return this.stdErr;
  }

  /**
   * Returns a string representation of the exception.
   * @returns A string representation of the exception
   */
  override toString(): string {
    return `HelmExecutionException{message=${this.message}, exitCode=${this.getExitCode()}, stdOut='${this.getStdOut()}', stdErr='${this.getStdErr()}'}`;
  }
}
