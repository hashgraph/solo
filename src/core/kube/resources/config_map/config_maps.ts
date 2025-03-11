// SPDX-License-Identifier: Apache-2.0

import {type V1ConfigMap} from '@kubernetes/client-node';
import {type NamespaceName} from '../namespace/namespace_name.js';

export interface ConfigMaps {
  /**
   * Create a new config map. If the config map already exists, it will not be replaced.
   *
   * @param namespace - for the config map
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   * @throws {ResourceCreateError} if the config map could not be created.
   * @throws {KubeApiError} if the API call fails for an unexpected reason.
   */
  create(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>;

  /**
   * Create or replace a config map. If the config map already exists, it will be replaced.
   *
   * @param namespace - for the config map
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   * @throws {ResourceCreateError} if the config map could not be created.
   * @throws {ResourceReplaceError} if the config map could not be replaced.
   * @throws {KubeApiError} if the API call fails for an unexpected reason.
   */
  createOrReplace(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>;

  /**
   * Read a config map
   * @param namespace - for the config map
   * @param name - for the config name
   */
  read(namespace: NamespaceName, name: string): Promise<V1ConfigMap>;

  /**
   * Replace an existing config map with a new one
   * @param namespace - for the config map
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   */
  replace(
    namespace: NamespaceName,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>;

  /**
   * Delete a config map
   * @param namespace - for the config map
   * @param name - for the config name
   */
  delete(namespace: NamespaceName, name: string): Promise<boolean>;

  /**
   * Check if a config map exists
   * @param namespace - for the config map
   * @param name - for the config name
   */
  exists(namespace: NamespaceName, name: string): Promise<boolean>;

  /**
   * List all config maps in a namespace for the given labels
   * @param namespace - for the config maps
   * @param labels - for the config maps
   * @returns list of config maps
   * @throws SoloError if the list operation fails
   */
  list(namespace: NamespaceName, labels: string[]): Promise<V1ConfigMap[]>;

  /**
   * List all config maps in all namespaces for the given labels
   * @param labels - for the config maps
   * @returns list of config maps
   * @throws SoloError if the list operation fails
   */
  listForAllNamespaces(labels: string[]): Promise<V1ConfigMap[]>;

  /**
   * Patch a config map
   * @param namespace - the namespace for the config map
   * @param name - the name of the config map
   * @param data - the data to patch
   */
  update(namespace: NamespaceName, name: string, data: Record<string, string>): Promise<void>;
}
