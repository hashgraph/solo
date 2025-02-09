/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type PodName} from './resources/pod/pod_name.js';
import {type NamespaceName} from './resources/namespace/namespace_name.js';
import {ResourceRef} from './resource_ref.js';
import {type ServiceName} from './service_name.js';

/**
 * Represents a Kubernetes service reference which includes the namespace name and service name.
 */
export class ServiceRef extends ResourceRef<ServiceName> {
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
