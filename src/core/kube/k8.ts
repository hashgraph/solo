/**
 * SPDX-License-Identifier: Apache-2.0
 */
import type * as k8s from '@kubernetes/client-node';
import {type V1Lease} from '@kubernetes/client-node';
import {type TarCreateFilter} from '../../types/aliases.js';
import {type TDirectoryData} from './t_directory_data.js';
import {type Namespaces} from './resources/namespace/namespaces.js';
import {type NamespaceName} from './resources/namespace/namespace_name.js';
import {type Containers} from './containers.js';
import {type Clusters} from './clusters.js';
import {type ConfigMaps} from './config_maps.js';
import {type ContainerRef} from './container_ref.js';
import {type Contexts} from './contexts.js';
import {type Pvcs} from './resources/pvc/pvcs.js';
import {type Services} from './services.js';
import {type Pods} from './resources/pod/pods.js';
import {type Leases} from './resources/lease/leases.js';
import {type IngressClasses} from './ingress_classes.js';
import {type Secrets} from './secrets.js';

export interface K8 {
  /**
   * Fluent accessor for reading and manipulating namespaces.
   * @returns an object instance providing namespace operations
   */
  namespaces(): Namespaces;

  /**
   * Fluent accessor for reading and manipulating containers.
   * returns an object instance providing container operations
   */
  containers(): Containers;

  /**
   * Fluent accessor for reading and manipulating cluster information from the kubeconfig file.
   * @returns an object instance providing cluster operations
   */
  clusters(): Clusters;

  /**
   * Fluent accessor for reading and manipulating config maps.
   * @returns an object instance providing config map operations
   */
  configMaps(): ConfigMaps;

  /**
   * Fluent accessor for reading and manipulating contexts in the kubeconfig file.
   * @returns an object instance providing context operations
   */
  contexts(): Contexts;

  /**
   * Fluent accessor for reading and manipulating services.
   * @returns an object instance providing service operations
   */
  services(): Services;

  /**
   * Fluent accessor for reading and manipulating pods in the kubernetes cluster.
   * @returns an object instance providing pod operations
   */
  pods(): Pods;

  /**
   * Fluent accessor for reading and manipulating pvcs (persistent volume claims) in the kubernetes cluster.
   * @returns an object instance providing pvc (persistent volume claim) operations
   */
  pvcs(): Pvcs;

  /**
   * Fluent accessor for reading and manipulating leases in the kubernetes cluster.
   * @returns an object instance providing lease operations
   */
  leases(): Leases;

  /**
   * Fluent accessor for reading and manipulating secrets in the kubernetes cluster.
   * @returns an object instance providing secret operations
   */
  secrets(): Secrets;

  /**
   * Fluent accessor for reading and manipulating ingress classes in the kubernetes cluster.
   * @returns an object instance providing ingress class operations
   */
  ingressClasses(): IngressClasses;

  /**
   * List files and directories in a container
   *
   * It runs ls -la on the specified path and returns a list of object containing the entries.
   * For example:
   * [{
   *    directory: false,
   *    owner: hedera,
   *    group: hedera,
   *    size: 121,
   *    modifiedAt: Jan 15 13:50
   *    name: config.txt
   * }]
   *
   * @param containerRef - the container reference
   * @param destPath - path inside the container
   * @returns a promise that returns array of directory entries, custom object
   */
  listDir(containerRef: ContainerRef, destPath: string): Promise<any[] | TDirectoryData[]>;

  /**
   * Check if a filepath exists in the container
   * @param containerRef - the container reference
   * @param destPath - path inside the container
   * @param [filters] - an object with metadata fields and value
   */
  hasFile(containerRef: ContainerRef, destPath: string, filters?: object): Promise<boolean>;

  /**
   * Check if a directory path exists in the container
   * @param containerRef - the container reference
   * @param destPath - path inside the container
   */
  hasDir(containerRef: ContainerRef, destPath: string): Promise<boolean>;

  mkdir(containerRef: ContainerRef, destPath: string): Promise<string>;

  /**
   * Copy a file into a container
   *
   * It overwrites any existing file inside the container at the destination directory
   *
   * @param containerRef - the container reference
   * @param srcPath - source file path in the local
   * @param destDir - destination directory in the container
   * @param [filter] - the filter to pass to tar to keep or skip files or directories
   * @returns a Promise that performs the copy operation
   */
  copyTo(
    containerRef: ContainerRef,
    srcPath: string,
    destDir: string,
    filter?: TarCreateFilter | undefined,
  ): Promise<boolean>;

  /**
   * Copy a file from a container
   *
   * It overwrites any existing file at the destination directory
   *
   * @param containerRef - the container reference
   * @param srcPath - source file path in the container
   * @param destDir - destination directory in the local
   */
  copyFrom(containerRef: ContainerRef, srcPath: string, destDir: string): Promise<unknown>;

  /**
   * Invoke sh command within a container and return the console output as string
   * @param containerRef - the container reference
   * @param command - sh commands as an array to be run within the containerName (e.g 'ls -la /opt/hgcapp')
   * @returns console output as string
   */
  execContainer(containerRef: ContainerRef, command: string | string[]): Promise<string>;

  /**
   * Get a list of persistent volume claim names for the given namespace
   * @param namespace - the namespace of the persistent volume claims to return
   * @param [labels] - labels
   * @returns list of persistent volume claim names
   */
  listPvcsByNamespace(namespace: NamespaceName, labels?: string[]): Promise<string[]>;

  /**
   * Delete a persistent volume claim
   * @param name - the name of the persistent volume claim to delete
   * @param namespace - the namespace of the persistent volume claim to delete
   * @returns true if the persistent volume claim was deleted
   */
  deletePvc(name: string, namespace: NamespaceName): Promise<boolean>;

  patchIngress(namespace: NamespaceName, ingressName: string, patch: object): Promise<void>;

  patchConfigMap(namespace: NamespaceName, configMapName: string, data: Record<string, string>): Promise<void>;
}
