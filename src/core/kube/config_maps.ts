/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type V1ConfigMap} from '@kubernetes/client-node';

export default interface ConfigMaps {
  create(
    namespace: string,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>; // TODO was createNamespacedConfigMap
  delete(namespace: string, name: string): Promise<boolean>; // TODO was deleteNamespacedConfigMap
  read(namespace: string, name: string): Promise<V1ConfigMap>; // TODO was getNamespacedConfigMap
  replace(
    namespace: string,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>; // TODO was replaceNamespacedConfigMap
}
