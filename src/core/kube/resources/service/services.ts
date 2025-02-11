/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type NamespaceName} from '../namespace/namespace_name.js';
import {type Service} from './service.js';
import {type ServiceRef} from './service_ref.js';

export interface Services {
  /**
   * Get a svc by name
   * @param namespace - namespace
   * @param name - service name
   */
  read(namespace: NamespaceName, name: string): Promise<Service>; // TODO was getSvcByName

  /**
   * List all services in a namespace
   * @param namespace - namespace
   * @param labels - labels
   */
  list(namespace: NamespaceName, labels?: string[]): Promise<Service[]>; // TODO was listSvcs

  /**
   * Create a service
   * @param serviceRef - service reference
   * @param labels - the labels for the service
   * @param servicePort - the service port
   * @param podTargetPort - the target port
   * @returns the service
   * @throws {SoloError} if the service could not be created
   */
  create(
    serviceRef: ServiceRef,
    labels: Record<string, string>,
    servicePort: number,
    podTargetPort: number,
  ): Promise<Service>;
}
