// SPDX-License-Identifier: Apache-2.0

import {type ResourceOperation} from './resources/resource-operation.js';
import {type ResourceType} from './resources/resource-type.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {ResourceNotFoundError} from './errors/resource-operation-errors.js';
import {StatusCodes} from 'http-status-codes';
import {KubeApiError} from './errors/kube-api-error.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';

interface ApiError extends Error {
  code?: number;
  statusCode?: number;
  body?: unknown;
  headers?: unknown;
  input?: unknown;
}

export class KubeApiResponse {
  /**
   * Checks the response for an error status code to determine which error should be thrown.
   *
   * @param errorResponse - the error response returned from the Kubernetes API call.
   * @param resourceType - the type of resource being checked.
   * @param resourceOperation - the operation being performed on the resource.
   * @param namespace - the namespace of the resource being checked.
   * @param name - the name of the resource being checked.
   */
  public static throwError(
    errorResponse: ApiError,
    resourceOperation: ResourceOperation,
    resourceType: ResourceType,
    namespace: NamespaceName,
    name: string,
  ): never {
    if (KubeApiResponse.isNotFound(errorResponse)) {
      throw new ResourceNotFoundError(resourceOperation, resourceType, namespace, name);
    }

    const isDeveloperMode: boolean = container.resolve<SoloLogger>(InjectTokens.SoloLogger).isDevMode();
    if (KubeApiResponse.isFailingStatus(errorResponse)) {
      throw new KubeApiError(
        `failed to ${resourceOperation} ${resourceType} '${name}' in namespace '${namespace}'`,
        errorResponse?.code || errorResponse?.statusCode,
        errorResponse?.input,
        isDeveloperMode ? errorResponse : undefined,
        {
          resourceType: resourceType,
          resourceOperation: resourceOperation,
          namespace: namespace,
          name: name,
        },
      );
    }

    throw new KubeApiError(
      `error occurred during ${resourceOperation} ${resourceType} '${name}' in namespace '${namespace}'`,
      errorResponse?.code || errorResponse?.statusCode,
      errorResponse?.input,
      isDeveloperMode ? errorResponse : undefined,
      {
        resourceType: resourceType,
        resourceOperation: resourceOperation,
        namespace: namespace,
        name: name,
      },
    );
  }

  /**
   * Checks if the error response has a status code indicating a failing status (greater than 202 Accepted).
   * @param errorResponse
   */
  public static isFailingStatus(errorResponse: ApiError): boolean {
    return (
      (errorResponse?.code || errorResponse?.statusCode || StatusCodes.INTERNAL_SERVER_ERROR) > StatusCodes.ACCEPTED
    );
  }

  /**
   * Checks if the error response has a status code indicating a "Not Found" error (404).
   * @param errorResponse
   */
  public static isNotFound(errorResponse: ApiError): boolean {
    return errorResponse?.code === StatusCodes.NOT_FOUND || errorResponse?.statusCode === StatusCodes.NOT_FOUND;
  }

  private static readonly TRANSIENT_STATUS_CODES: number[] = [
    StatusCodes.TOO_MANY_REQUESTS,
    StatusCodes.INTERNAL_SERVER_ERROR,
    StatusCodes.BAD_GATEWAY,
    StatusCodes.SERVICE_UNAVAILABLE,
    StatusCodes.GATEWAY_TIMEOUT,
  ];

  /**
   * Checks if the error response has a status code indicating a transient server-side failure
   * (e.g. `etcdserver: request timed out` surfaces as 500) that is safe to retry for
   * idempotent operations.
   * @param errorResponse
   */
  public static isTransientServerError(errorResponse: ApiError): boolean {
    const code: number = errorResponse?.code || errorResponse?.statusCode;
    return KubeApiResponse.TRANSIENT_STATUS_CODES.includes(code);
  }

  /**
   * Checks if the error response has a status code indicating a "Created" status (201).
   * @param errorResponse
   */
  public static isCreatedStatus(errorResponse: ApiError): boolean {
    return errorResponse?.code === StatusCodes.CREATED || errorResponse?.statusCode === StatusCodes.CREATED;
  }
}
