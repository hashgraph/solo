// SPDX-License-Identifier: Apache-2.0

export class ErrorMessages {
  public static readonly LOCAL_CONFIG_DOES_NOT_EXIST =
    'Please create a local configuration first. Run "solo deployment create"';

  public static readonly LOCAL_CONFIG_DEPLOYMENT_DOES_NOT_EXIST =
    'The selected deployment does not correspond to a deployment in the local configuration';

  public static readonly LOCAL_CONFIG_GENERIC = 'Validation of local config failed';

  public static readonly LOCAL_CONFIG_INVALID_EMAIL = 'Invalid email address provided';

  public static readonly LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT = 'Wrong deployments format';

  public static readonly LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT = 'Wrong clusterRefs format';

  public static readonly LOCAL_CONFIG_INVALID_SOLO_VERSION = 'Invalid solo version';

  public static readonly LOCAL_CONFIG_READING_BEFORE_LOADING = 'Attempting to read from local config before loading it';

  public static readonly LOCAL_CONFIG_MODIFY_BEFORE_LOADING = 'Attempting to modify local config before loading it';

  public static readonly LOCAL_CONFIG_WRITING_BEFORE_LOADING = 'Attempting to write local config before loading it';

  public static INVALID_CONTEXT_FOR_CLUSTER = (context: string, cluster?: string): string =>
    `Context ${context} is not valid for cluster ${cluster || ''}`;

  public static INVALID_CONTEXT_FOR_CLUSTER_DETAILED = (context: string, cluster?: string): string =>
    `Context ${context} is not valid for cluster ${cluster || ''}. ` +
    'Please select a valid context for the cluster or use kubectl to create a new context and try again';

  public static REMOTE_CONFIGS_DO_NOT_MATCH = (cluster1: string, cluster2: string): string =>
    `The remote configurations in clusters ${cluster1} and ${cluster2} do not match. They need to be synced manually. ` +
    'Please select a valid context for the cluster or use kubectl to create a new context and try again.';

  public static REMOTE_CONFIG_IS_INVALID = (cluster: string): string =>
    `The remote configuration in cluster ${cluster} is invalid and needs to be fixed manually`;

  public static DEPLOYMENT_NAME_ALREADY_EXISTS = (deploymentName: string): string =>
    `A deployment named ${deploymentName} already exists. Please select a different name`;
}
