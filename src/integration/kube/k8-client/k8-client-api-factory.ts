// SPDX-License-Identifier: Apache-2.0

import {
  type ApiConstructor,
  type ApiType,
  type Cluster,
  type Configuration,
  type KubeConfig,
  createConfiguration,
  IsomorphicFetchHttpLibrary,
  ServerConfiguration,
  wrapHttpLibrary,
} from '@kubernetes/client-node';
import {RetryingHttpLibrary} from './retrying-http-library.js';
import {MissingActiveClusterError} from '../errors/missing-active-cluster-error.js';

/**
 * Creates Kubernetes API clients backed by the throttling-aware {@link RetryingHttpLibrary}, mirroring
 * {@link KubeConfig.makeApiClient}, which offers no hook for customizing the HTTP library.
 */
export class K8ClientApiFactory {
  /**
   * Creates an API client of the requested type for the current cluster of the supplied kube config.
   * @throws MissingActiveClusterError - if the kube config has no current cluster.
   */
  public static makeApiClient<T extends ApiType>(kubeConfig: KubeConfig, apiClientType: ApiConstructor<T>): T {
    const cluster: Cluster = kubeConfig.getCurrentCluster();
    if (!cluster) {
      throw new MissingActiveClusterError();
    }

    const configuration: Configuration = createConfiguration({
      baseServer: new ServerConfiguration<Record<string, string>>(cluster.server, {}),
      authMethods: {default: kubeConfig},
      httpApi: wrapHttpLibrary(new RetryingHttpLibrary(new IsomorphicFetchHttpLibrary())),
    });

    return new apiClientType(configuration);
  }
}
