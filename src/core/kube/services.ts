/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1Service} from '@kubernetes/client-node';

export interface Services {
  /**
   * Get a svc by name
   * @param namespace - namespace
   * @param name - service name
   */
  read(namespace: string, name: string): Promise<V1Service>; // TODO was getSvcByName

  /**
   * List all services in a namespace
   * @param namespace - namespace
   * @param labels - labels
   */
  list(namespace: string, labels: string[]): Promise<V1Service[]>; // TODO was listSvcs
}
