// SPDX-License-Identifier: Apache-2.0

import {type PodName} from '../pod/pod-name.js';
import {type NamespaceName} from '../namespace/namespace-name.js';
import {ResourceReference as ResourceReference} from '../resource-reference.js';
import {type ServiceName} from './service-name.js';

/**
 * Represents a Kubernetes service reference which includes the namespace name and service name.
 */
export class ServiceRef extends ResourceReference<ServiceName> {
  private constructor(namespace: NamespaceName, name: PodName) {
    super(namespace, name);
  }

  /**
   * Creates a service reference.
   * @param namespace The namespace name.
   * @param serviceName The service name.
   */
  public static of(namespace: NamespaceName, serviceName: ServiceName): ServiceRef {
    return new ServiceRef(namespace, serviceName);
  }
}
