/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Cluster, type Context, type EmailAddress, type Namespace} from './remote/types.js';

export interface DeploymentStructure {
  // A list of clusters on which the deployment is deployed
  clusters: Cluster[];
}

export type ClusterContextMapping = Record<Cluster, Context>;

export type Deployments = Record<Namespace, DeploymentStructure>;

export interface LocalConfigData {
  // Only used to differentiate the current user. Not actually used to send emails
  userEmailAddress: EmailAddress;

  // A list of all deployments
  deployments: Deployments;

  // The currently selected deployment
  currentDeploymentName: Namespace;

  // Every cluster must have a kubectl context associated to it, which is used to establish a connection.
  clusterContextMapping: ClusterContextMapping;
}
