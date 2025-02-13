/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ClusterRef, type Context, type DeploymentName, type NamespaceNameAsString} from '../remote/types.js';
import {type Deployment} from './deployment.js';
import {type DataObject} from './data_object.js';
import {type User} from './user.js';
import {type Metadata} from './metadata.js';

export interface LocalConfig extends DataObject<LocalConfig> {
  metadata: Metadata;
  user: User;
  deployments: Record<DeploymentName, Deployment>;
  clusterRefs: Record<ClusterRef, Context>;

  /**
   * Writes the LocalConfig data structure to a file. If the file already exists, it will be overwritten.
   * @param filePath The path of the file to which the LocalConfig data structure should be written
   */
  write(filePath: string): Promise<void>;

  /**
   * Fluent accessor for managing deployments.
   * @returns DeploymentsFluent - a fluent accessor for managing deployments
   */
  deployment(): DeploymentsFluent;

  /**
   * Fluent accessor for managing cluster references.
   * @returns ClusterRefsFluent - a fluent accessor for managing cluster references
   */
  clusterRef(): ClusterRefsFluent;
}

export interface ClusterRefsFluent {
  add(clusterRef: ClusterRef, context: Context): void;
  remove(clusterRef: ClusterRef): void;
}

export interface DeploymentsFluent {
  list(): Deployment[];
  byName(deploymentName: DeploymentName): Deployment;
  add(deploymentName: DeploymentName, namespace: NamespaceNameAsString): Deployment;
  remove(deploymentName: DeploymentName): void;
}
