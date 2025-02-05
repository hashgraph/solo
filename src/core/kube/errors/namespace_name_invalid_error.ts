/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {SoloError} from '../../errors.js';

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

export class PodNameInvalidError extends SoloError {
  public static POD_NAME_INVALID = (name: string) => RFC_1123_POSTFIX(`Pod name '${name}'`);

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param podName - the invalid pod name.
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(podName: string, cause: Error | any = {}, meta: any = {}) {
    super(PodNameInvalidError.POD_NAME_INVALID(podName), cause, meta);
  }
}

export class MissingNamespaceNameError extends SoloError {
  public static MISSING_NAMESPACE_NAME = 'Namespace name is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause: Error | any = {}, meta: any = {}) {
    super(MissingNamespaceNameError.MISSING_NAMESPACE_NAME, cause, meta);
  }
}

export class MissingPodNameError extends SoloError {
  public static MISSING_POD_NAME = 'Pod name is required.';

  /**
   * Instantiates a new error with a message and an optional cause.
   *
   * @param cause - optional underlying cause of the error.
   * @param meta - optional metadata to be reported.
   */
  public constructor(cause: Error | any = {}, meta: any = {}) {
    super(MissingPodNameError.MISSING_POD_NAME, cause, meta);
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
