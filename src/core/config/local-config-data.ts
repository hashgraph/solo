// SPDX-License-Identifier: Apache-2.0

import {
  type ClusterRef,
  type ClusterRefs,
  type DeploymentName,
  type EmailAddress,
  type NamespaceNameAsString,
  type Version,
} from './remote/types.js';

export interface DeploymentStructure {
  // A list of clusters on which the deployment is deployed
  clusters: ClusterRef[];
  namespace: NamespaceNameAsString;
}

export type Deployments = Record<DeploymentName, DeploymentStructure>;

export interface LocalConfigData {
  // Only used to differentiate the current user. Not actually used to send emails
  userEmailAddress: EmailAddress;

  // A list of all deployments
  deployments: Deployments;

  // Every cluster must have a kubectl context associated to it, which is used to establish a connection.
  clusterRefs: ClusterRefs;

  // Solo CLI version
  soloVersion: Version;
}
