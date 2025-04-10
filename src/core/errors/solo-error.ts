// SPDX-License-Identifier: Apache-2.0

export class SoloError extends Error {
  public readonly statusCode?: number;
  /**
   * Create a custom error object
   *
   * error metadata will include the `cause`
   *
   * @param message error message
   * @param cause source error (if any)
   * @param meta additional metadata (if any)
   */
  public constructor(
    public override message: string,
    public override cause: Error | any = {},
    public meta: any = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = cause?.statusCode;
    Error.captureStackTrace(this, this.constructor);
    if (cause) {
      this.cause = cause;
      if (cause instanceof Error) {
        this.stack += `\nCaused by: ${(this.cause as Error).stack}`;
      }
    }
  }
}
