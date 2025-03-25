// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../core/errors/solo-error.js';
import {type ResourceType} from '../resources/resource-type.js';

const RFC_1123_POSTFIX = (prefix: string) => `${prefix} is invalid, must be a valid RFC-1123 DNS label.  \` +
    "A DNS 1123 label must consist of lower case alphanumeric characters, '-' " +
    "or '.', and must start and end with an alphanumeric character.`;

export class InvalidResourceNameError extends SoloError {
  public static RESOURCE_NAME_INVALID = (type: ResourceType, name: string) =>
    RFC_1123_POSTFIX(`${type} name '${name}'`);

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param name - the invalid pod name.
   * @param type - the type of the resource.
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(name: string, type: ResourceType, cause: Error | any = {}, meta: any = {}) {
    super(InvalidResourceNameError.RESOURCE_NAME_INVALID(type, name), cause, meta);
  }
}
