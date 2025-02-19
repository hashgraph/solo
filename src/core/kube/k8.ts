/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Namespaces} from './resources/namespace/namespaces.js';
import {type Containers} from './resources/container/containers.js';
import {type Clusters} from './resources/cluster/clusters.js';
import {type ConfigMaps} from './resources/config_map/config_maps.js';
import {type Contexts} from './resources/context/contexts.js';
import {type Pvcs} from './resources/pvc/pvcs.js';
import {type Services} from './resources/service/services.js';
import {type Pods} from './resources/pod/pods.js';
import {type Leases} from './resources/lease/leases.js';
import {type IngressClasses} from './resources/ingress_class/ingress_classes.js';
import {type Secrets} from './resources/secret/secrets.js';
import {type Ingresses} from './resources/ingress/ingresses.js';

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
   * Fluent accessor for reading and manipulating ingresses in the kubernetes cluster.
   * @returns an object instance providing ingress operations
   */
  ingresses(): Ingresses;
}
