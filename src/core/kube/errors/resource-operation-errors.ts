// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {ResourceOperation} from '../resources/resource-operation.js';
import {type ResourceType} from '../resources/resource-type.js';
import {type NamespaceName} from '../resources/namespace/namespace-name.js';

export class ResourceOperationError extends SoloError {
  /**
   * Instantiates a new error with a message and an optional cause.
   * @param operation - the operation that failed.
   * @param resourceType - the type of resource that failed to read.
   * @param namespace - the namespace of the resource.
   * @param name - the name of the resource.
   * @param cause - optional underlying cause of the error.
   */
  public constructor(
    operation: ResourceOperation,
    resourceType: ResourceType,
    namespace: NamespaceName,
    name: string,
    cause?: Error,
  ) {
    super(`failed to ${operation} ${resourceType} '${name}' in namespace '${namespace}'`, cause, {
      operation: operation,
      resourceType: resourceType,
      namespace: namespace?.name,
      name: name,
    });
  }
}

export class ResourceReadError extends ResourceOperationError {
  /**
   * Instantiates a new error with a message and an optional cause.
   * @param resourceType - the type of resource that failed to read.
   * @param namespace - the namespace of the resource.
   * @param name - the name of the resource.
   * @param cause - optional underlying cause of the error.
   */
  public constructor(resourceType: ResourceType, namespace: NamespaceName, name: string, cause?: Error) {
    super(ResourceOperation.READ, resourceType, namespace, name, cause);
  }
}

export class ResourceCreateError extends ResourceOperationError {
  /**
   * Instantiates a new error with a message and an optional cause.
   * @param resourceType - the type of resource that failed to create.
   * @param namespace - the namespace of the resource.
   * @param name - the name of the resource.
   * @param cause - optional underlying cause of the error.
   */
  public constructor(resourceType: ResourceType, namespace: NamespaceName, name: string, cause?: Error) {
    super(ResourceOperation.CREATE, resourceType, namespace, name, cause);
  }
}

export class ResourceUpdateError extends ResourceOperationError {
  /**
   * Instantiates a new error with a message and an optional cause.
   * @param resourceType - the type of resource that failed to update.
   * @param namespace - the namespace of the resource.
   * @param name - the name of the resource.
   * @param cause - optional underlying cause of the error.
   */
  public constructor(resourceType: ResourceType, namespace: NamespaceName, name: string, cause?: Error) {
    super(ResourceOperation.UPDATE, resourceType, namespace, name, cause);
  }
}

export class ResourceDeleteError extends ResourceOperationError {
  /**
   * Instantiates a new error with a message and an optional cause.
   * @param resourceType - the type of resource that failed to delete.
   * @param namespace - the namespace of the resource.
   * @param name - the name of the resource.
   * @param cause - optional underlying cause of the error.
   */
  public constructor(resourceType: ResourceType, namespace: NamespaceName, name: string, cause?: Error) {
    super(ResourceOperation.DELETE, resourceType, namespace, name, cause);
  }
}

export class ResourceReplaceError extends ResourceOperationError {
  /**
   * Instantiates a new error with a message and an optional cause.
   * @param resourceType - the type of resource that failed to replace.
   * @param namespace - the namespace of the resource.
   * @param name - the name of the resource.
   * @param cause - optional underlying cause of the error.
   */
  public constructor(resourceType: ResourceType, namespace: NamespaceName, name: string, cause?: Error) {
    super(ResourceOperation.REPLACE, resourceType, namespace, name, cause);
  }
}

export class ResourceNotFoundError extends ResourceOperationError {
  /**
   * Instantiates a new error with a message and an optional cause.
   * @param operation - the operation that failed.
   * @param resourceType - the type of resource that failed to read.
   * @param namespace - the namespace of the resource.
   * @param name - the name of the resource.
   * @param cause - optional underlying cause of the error.
   */
  public constructor(
    operation: ResourceOperation,
    resourceType: ResourceType,
    namespace: NamespaceName,
    name: string,
    cause?: Error,
  ) {
    super(operation, resourceType, namespace, name, cause);
  }
}
