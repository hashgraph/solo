/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Service} from '@kubernetes/client-node';
import {type NamespaceName} from './namespace_name.js';
import {type Service} from './service.js';

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
}
