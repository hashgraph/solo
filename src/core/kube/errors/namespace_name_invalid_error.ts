// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/SoloError.js';

const RFC_1123_POSTFIX = (prefix: string) => `${prefix} is invalid, must be a valid RFC-1123 DNS label.  \` +
    "A DNS 1123 label must consist of lower case alphanumeric characters, '-' " +
    "or '.', and must start and end with an alphanumeric character.`;

export class NamespaceNameInvalidError extends SoloError {
  public static NAMESPACE_NAME_INVALID = (name: string) => RFC_1123_POSTFIX(`Namespace name '${name}'`);

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param namespaceName - the invalid namespace name.
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(namespaceName: string, cause: Error | any = {}, meta: any = {}) {
    super(NamespaceNameInvalidError.NAMESPACE_NAME_INVALID(namespaceName), cause, meta);
  }
}

export class ContainerNameInvalidError extends SoloError {
  public static CONTAINER_NAME_INVALID = (name: string) => RFC_1123_POSTFIX(`Container name '${name}'`);

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param containerName - the invalid container name.
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(containerName: string, cause: Error | any = {}, meta: any = {}) {
    super(ContainerNameInvalidError.CONTAINER_NAME_INVALID(containerName), cause, meta);
  }
}

export class MissingPodRefError extends SoloError {
  public static MISSING_POD_REF = 'Pod ref is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause: Error | any = {}, meta: any = {}) {
    super(MissingPodRefError.MISSING_POD_REF, cause, meta);
  }
}

export class MissingContainerNameError extends SoloError {
  public static MISSING_CONTAINER_NAME = 'Container Name is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause: Error | any = {}, meta: any = {}) {
    super(MissingContainerNameError.MISSING_CONTAINER_NAME, cause, meta);
  }
}
