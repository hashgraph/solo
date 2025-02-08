/**
 * SPDX-License-Identifier: Apache-2.0
 */
import type http from 'node:http';
import {type ResourceOperation} from './resource_operation.js';
import {type ResourceType} from './resource_type.js';
import {type NamespaceName} from './namespace_name.js';
import {ResourceNotFoundError} from './errors/resource_operation_errors.js';
import {StatusCodes} from 'http-status-codes';
import {KubeApiError} from './errors/kube_api_error.js';

export class KubeApiResponse {
  private constructor() {}

  /**
   * Checks the response for an error status code and throws an error if one is found.
   *
   * @param response - the HTTP response to be verified.
   * @param resourceType - the type of resource being checked.
   * @param resourceOperation - the operation being performed on the resource.
   * @param namespace - the namespace of the resource being checked.
   * @param name - the name of the resource being checked.
   */
  public static check(
    response: http.IncomingMessage,
    resourceOperation: ResourceOperation,
    resourceType: ResourceType,
    namespace: NamespaceName,
    name: string,
  ): void {
    if (KubeApiResponse.isNotFound(response)) {
      throw new ResourceNotFoundError(resourceOperation, resourceType, namespace, name);
    }

    if (KubeApiResponse.isFailingStatus(response)) {
      throw new KubeApiError(
        `failed to ${resourceOperation} ${resourceType} '${name}' in namespace '${namespace}'`,
        +response?.statusCode,
        null,
        {
          resourceType: resourceType,
          resourceOperation: resourceOperation,
          namespace: namespace,
          name: name,
        },
      );
    }
  }

  public static isFailingStatus(response: http.IncomingMessage): boolean {
    return (+response?.statusCode || StatusCodes.INTERNAL_SERVER_ERROR) > StatusCodes.ACCEPTED;
  }

  public static isNotFound(response: http.IncomingMessage): boolean {
    return +response?.statusCode === StatusCodes.NOT_FOUND;
  }

  public static isCreatedStatus(response: http.IncomingMessage): boolean {
    return +response?.statusCode === StatusCodes.CREATED;
  }
}
