// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type Service} from './service.js';
import {type ServiceReference} from './service-reference.js';

export interface Services {
  /**
   * Get a svc by name
   * @param namespace - namespace
   * @param name - service name
   */
  read(namespace: NamespaceName, name: string): Promise<Service>;

  /**
   * List all services in a namespace
   * @param namespace - namespace
   * @param labels - labels
   */
  list(namespace: NamespaceName, labels?: string[]): Promise<Service[]>;

  /**
   * Wait until every LoadBalancer-typed service matching the labels has an external address assigned.
   * @param namespace - namespace
   * @param labels - service labels
   * @param maxAttempts - maximum attempts to check
   * @param delay - delay between checks in milliseconds
   * @returns the matching LoadBalancer services
   * @throws {KubeServiceLoadBalancerTimeoutError} if no address is assigned within the allotted attempts
   */
  waitForLoadBalancerAddress(
    namespace: NamespaceName,
    labels: string[],
    maxAttempts: number,
    delay: number,
  ): Promise<Service[]>;

  /**
   * Create a service
   * @param serviceReference - service reference
   * @param labels - the labels for the service
   * @param servicePort - the service port
   * @param podTargetPort - the target port
   * @param selector - optional pod label selector for the service
   * @param nodePort - optional fixed node port; when set the service is created with type NodePort
   * @returns the service
   * @throws {SoloError} if the service could not be created
   */
  create(
    serviceReference: ServiceReference,
    labels: Record<string, string>,
    servicePort: number,
    podTargetPort: number,
    selector?: Record<string, string>,
    nodePort?: number,
  ): Promise<Service>;
}
