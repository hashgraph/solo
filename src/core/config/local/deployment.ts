/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ClusterRef, type NamespaceNameAsString} from '../remote/types.js';
import {type DataObject} from './data_object.js';

export interface Deployment extends DataObject<Deployment> {
  namespace: NamespaceNameAsString;
  clusters: ClusterRef[];

  /**
   * Fluent accessor for managing clusters.
   * @returns ClusterFluent - a fluent accessor for managing clusters
   */
  cluster(): ClusterFluent;
}

export interface ClusterFluent {
  add(clusterRef: ClusterRef): void;
  remove(clusterRef: ClusterRef): void;
}
