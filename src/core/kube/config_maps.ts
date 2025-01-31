/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1ConfigMap} from '@kubernetes/client-node';

export interface ConfigMaps {
  /**
   * Create a new config map
   * @param namespace - for the config map
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   */
  create(
    namespace: string,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>; // TODO was createNamespacedConfigMap

  /**
   * Delete a config map
   * @param namespace - for the config map
   * @param name - for the config name
   */
  delete(namespace: string, name: string): Promise<boolean>; // TODO was deleteNamespacedConfigMap

  /**
   * Read a config map
   * @param namespace - for the config map
   * @param name - for the config name
   */
  read(namespace: string, name: string): Promise<V1ConfigMap>; // TODO was getNamespacedConfigMap

  /**
   * Replace an existing config map with a new one
   * @param namespace - for the config map
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   */
  replace(
    namespace: string,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>; // TODO was replaceNamespacedConfigMap
}
