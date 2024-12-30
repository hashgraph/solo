/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import type {Cluster, Context, EmailAddress, Namespace} from './remote/types.js';

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
