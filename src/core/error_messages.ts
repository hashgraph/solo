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

export const ErrorMessages = {
  LOCAL_CONFIG_CURRENT_DEPLOYMENT_DOES_NOT_EXIST:
    'The selected namespace does not correspond to a deployment in the local configuration',
  LOCAL_CONFIG_GENERIC: 'Validation of local config failed',
  LOCAL_CONFIG_INVALID_EMAIL: 'Invalid email address provided',
  LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT: 'Wrong deployments format',
  LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT: 'Wrong clusterContextMapping format',
  INVALID_CONTEXT_FOR_CLUSTER: (context: string, cluster?: string) =>
    `Context ${context} is not valid for cluster ${cluster || ''}`,
  INVALID_CONTEXT_FOR_CLUSTER_DETAILED: (context: string, cluster?: string) =>
    `Context ${context} is not valid for cluster ${cluster || ''}. Please select a valid context for the cluster or use kubectl to create a new context and try again`,
  REMOTE_CONFIGS_DO_NOT_MATCH: (cluster1: string, cluster2: string) =>
    `The remote configurations in clusters ${cluster1} and ${cluster2} do not match. They need to be synced manually. Please select a valid context for the cluster or use kubectl to create a new context and try again.`,
  REMOTE_CONFIG_IS_INVALID: (cluster: string) =>
    `The remote configuration in cluster ${cluster} is invalid and needs to be fixed manually`,
  DEPLOYMENT_NAME_ALREADY_EXISTS: (deploymentName: string) =>
    `A deployment named ${deploymentName} already exists. Please select a different name`,
};
