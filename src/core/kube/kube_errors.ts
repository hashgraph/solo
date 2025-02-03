/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {SoloError} from '../errors.js';

export class NamespaceNameInvalidError extends SoloError {
  public static NAMESPACE_NAME_INVALID = (name: string) =>
    `Namespace name '${name}' is invalid, must be a valid DNS 1123 label.  ` +
    "A DNS 1123 label must consist of lower case alphanumeric characters, '-' " +
    "or '.', and must start and end with an alphanumeric character.";
  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param message - the error message to be reported.
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(message: string, cause: Error | any = {}, meta: any = {}) {
    super(message, cause, meta);
  }
}
