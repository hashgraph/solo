// SPDX-License-Identifier: Apache-2.0

import {type KindClient} from '../kind-client.js';
import {GetClustersRequest} from '../request/get/get-clusters-request.js';
import {KindCluster} from '../model/kind-cluster.js';
import {type KindRequest} from '../request/kind-request.js';
import {KindExecutionBuilder} from '../execution/kind-execution-builder.js';
import {type KindExecution} from '../execution/kind-execution.js';
import {VersionRequest} from '../request/version-request.js';
import {KindVersion} from '../model/kind-version.js';
import {ClusterCreateRequest} from '../request/cluster/cluster-create-request.js';
import {type ClusterCreateOptions} from '../model/create-cluster/cluster-create-options.js';
import {ClusterCreateOptionsBuilder} from '../model/create-cluster/create-cluster-options-builder.js';
import {ClusterCreateResponse} from '../model/create-cluster/cluster-create-response.js';
import {ClusterDeleteResponse} from '../model/delete-cluster/cluster-delete-response.js';
import {type ClusterDeleteOptions} from '../model/delete-cluster/cluster-delete-options.js';
import {ClusterDeleteOptionsBuilder} from '../model/delete-cluster/cluster-delete-options-builder.js';
import {ClusterDeleteRequest} from '../request/cluster/cluster-delete-request.js';
import {BuildNodeImagesResponse} from '../model/build-node-images/build-node-images-response.js';
import {type BuildNodeImagesOptions} from '../model/build-node-images/build-node-images-options.js';
import {BuildNodeImagesRequest} from '../request/build/build-node-images-request.js';
import {ExportLogsRequest} from '../request/export/export-logs-request.js';
import {type ExportLogsOptions} from '../model/export-logs/export-logs-options.js';
import {ExportLogsResponse} from '../model/export-logs/export-logs-response.js';
import {ExportLogsOptionsBuilder} from '../model/export-logs/export-logs-options-builder.js';
import {ExportKubeConfigOptionsBuilder} from '../model/export-kubeconfig/export-kubeconfig-options-builder.js';
import {type ExportKubeConfigOptions} from '../model/export-kubeconfig/export-kubeconfig-options.js';
import {ExportKubeConfigRequest} from '../request/export/export-kubeconfig-request.js';
import {ExportKubeConfigResponse} from '../model/export-kubeconfig/export-kubeconfig-response.js';
import {GetNodesResponse} from '../model/get-nodes/get-nodes-response.js';
import {type GetNodesOptions} from '../model/get-nodes/get-nodes-options.js';
import {GetNodesOptionsBuilder} from '../model/get-nodes/get-nodes-options-builder.js';
import {GetNodesRequest} from '../request/get/get-nodes-request.js';
import {GetKubeConfigOptionsBuilder} from '../model/get-kubeconfig/get-kubeconfig-options-builder.js';
import {type GetKubeConfigOptions} from '../model/get-kubeconfig/get-kubeconfig-options.js';
import {GetKubeConfigRequest} from '../request/get/get-kubeconfig-request.js';
import {GetKubeConfigResponse} from '../model/get-kubeconfig/get-kubeconfig-response.js';
import {type LoadDockerImageOptions} from '../model/load-docker-image/load-docker-image-options.js';
import {LoadDockerImageRequest} from '../request/load/docker-image-request.js';
import {LoadDockerImageResponse} from '../model/load-docker-image/load-docker-image-response.js';
import {LoadDockerImageOptionsBuilder} from '../model/load-docker-image/load-docker-image-options-builder.js';
import {type LoadImageArchiveOptions} from '../model/load-image-archive/load-image-archive-options.js';
import {LoadImageArchiveOptionsBuilder} from '../model/load-image-archive/load-image-archive-options-builder.js';
import {LoadImageArchiveResponse} from '../model/load-image-archive/load-image-archive-response.js';
import {LoadImageArchiveRequest} from '../request/load/image-archive-request.js';
import {KIND_VERSION} from '../../../../version.js';
import {KindVersionRequirementException} from '../errors/kind-version-requirement-exception.js';
import {inject} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import path from 'node:path';
import {SubprocessEnvironment} from '../../../core/subprocess-environment.js';
import {SemanticVersion} from '../../../business/utils/semantic-version.js';

type BiFunction<T, U, R> = (t: T, u: U) => R;

export class DefaultKindClient implements KindClient {
  private static minimumVersion: SemanticVersion<string> = new SemanticVersion<string>(KIND_VERSION);

  public constructor(
    private readonly executable: string,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.KindInstallationDirectory) private readonly installationDirectory?: string,
  ) {
    if (!executable || !executable.trim()) {
      throw new Error('executable must not be blank');
    }
    this.executable = executable;
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.KindInstallationDirectory,
      this.constructor.name,
    );
  }

  public async checkVersion(): Promise<void> {
    const version: SemanticVersion<string> = await this.version();
    if (version.lessThan(DefaultKindClient.minimumVersion)) {
      throw new KindVersionRequirementException(
        `The Kind CLI version ${version} is lower than the minimum required version ${DefaultKindClient.minimumVersion}.`,
      );
    }
  }

  public async version(): Promise<SemanticVersion<string>> {
    const request: VersionRequest = new VersionRequest();
    const builder: KindExecutionBuilder = new KindExecutionBuilder();
    builder.executable(this.executable);
    request.apply(builder);
    const execution: KindExecution = builder.build();
    if (execution instanceof Promise) {
      throw new TypeError('Unexpected async execution');
    }
    const versionClass: typeof KindVersion = KindVersion;
    const result: KindVersion = await execution.responseAs(versionClass);
    if (!(result instanceof KindVersion)) {
      throw new TypeError('Unexpected response type');
    }

    const semver: SemanticVersion<string> = result.getVersion();

    this.logger?.info?.(`kind version: ${semver.toString()}`);

    return semver;
  }

  public async createCluster(clusterName: string, options?: ClusterCreateOptions): Promise<ClusterCreateResponse> {
    const builder: ClusterCreateOptionsBuilder = ClusterCreateOptionsBuilder.from(options);
    builder.name(clusterName);
    return this.executeAsync(new ClusterCreateRequest(builder.build()), ClusterCreateResponse);
  }

  public async deleteCluster(clusterName?: string, options?: ClusterDeleteOptions): Promise<ClusterDeleteResponse> {
    const builder: ClusterDeleteOptionsBuilder = ClusterDeleteOptionsBuilder.from(options);
    builder.name(clusterName);
    return this.executeAsync(new ClusterDeleteRequest(builder.build()), ClusterDeleteResponse);
  }

  public async buildNodeImage(options?: BuildNodeImagesOptions): Promise<BuildNodeImagesResponse> {
    return this.executeAsync(new BuildNodeImagesRequest(options), BuildNodeImagesResponse);
  }

  public async exportLogs(clusterName?: string): Promise<ExportLogsResponse> {
    const options: ExportLogsOptions = ExportLogsOptionsBuilder.builder().name(clusterName).build();
    return this.executeAsync(new ExportLogsRequest(options), ExportLogsResponse);
  }

  public async exportKubeConfig(clusterName?: string): Promise<ExportKubeConfigResponse> {
    const options: ExportKubeConfigOptions = ExportKubeConfigOptionsBuilder.builder().name(clusterName).build();
    return this.executeAsync(new ExportKubeConfigRequest(options), ExportKubeConfigResponse);
  }

  public async getClusters(): Promise<KindCluster[]> {
    return this.executeAsList(new GetClustersRequest(), KindCluster);
  }

  public async getNodes(contextName?: string, options?: GetNodesOptions): Promise<GetNodesResponse> {
    const builder: GetNodesOptionsBuilder = GetNodesOptionsBuilder.from(options).name(contextName);
    return this.executeAsync(new GetNodesRequest(builder.build()), GetNodesResponse);
  }

  public async getKubeConfig(contextName?: string, options?: GetKubeConfigOptions): Promise<GetKubeConfigResponse> {
    const builder: GetKubeConfigOptionsBuilder = GetKubeConfigOptionsBuilder.from(options).name(contextName);
    return this.executeAsync(new GetKubeConfigRequest(builder.build()), GetKubeConfigResponse);
  }

  public async loadDockerImage(imageName: string, options?: LoadDockerImageOptions): Promise<LoadDockerImageResponse> {
    const builder: LoadDockerImageOptionsBuilder = LoadDockerImageOptionsBuilder.from(options).imageName(imageName);
    return this.executeAsync(new LoadDockerImageRequest(builder.build()), LoadDockerImageResponse);
  }

  public async loadImageArchive(
    archivePath: string,
    options?: LoadImageArchiveOptions,
  ): Promise<LoadImageArchiveResponse> {
    const builder: LoadImageArchiveOptionsBuilder =
      LoadImageArchiveOptionsBuilder.from(options).archivePath(archivePath);

    await this.executeCall(new LoadImageArchiveRequest(builder.build()));
    return new LoadImageArchiveResponse();
  }

  private async executeCall<T extends KindRequest>(request: T): Promise<void> {
    const builder: KindExecutionBuilder = new KindExecutionBuilder();
    builder.executable(this.executable);
    builder.environmentVariable(
      'PATH',
      `${this.installationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
    );
    request.apply(builder);
    const execution: KindExecution = builder.build();
    await execution.call();
  }

  /**
   * Executes the given request and returns the response as the given class.
   * The request is executed using the default namespace.
   *
   * @param request - The request to execute
   * @param responseClass - The class of the response
   * @returns The response
   */
  private async executeAsync<T extends KindRequest, R>(
    request: T,
    responseClass?: new (...arguments_: any[]) => R,
  ): Promise<R> {
    return this.executeInternal(undefined, request, responseClass, async (b): Promise<R> => {
      return await b.responseAs(responseClass);
    });
  }

  /**
   * Executes the given request and returns the response as a list of the given class.
   * The request is executed using the default namespace.
   *
   * @param request - The request to execute
   * @param responseClass - The class of the response
   * @returns A list of response objects
   */
  private async executeAsList<T extends KindRequest, R>(
    request: T,
    responseClass: new (...arguments_: any[]) => R,
  ): Promise<R[]> {
    return this.executeInternal(undefined, request, responseClass, async (b): Promise<R[]> => {
      return await b.responseAsList(responseClass);
    });
  }

  private async executeInternal<T extends KindRequest, R, V>(
    namespace: string | undefined,
    request: T,
    responseClass: new (...arguments_: any[]) => R,
    responseFunction: BiFunction<KindExecution, typeof responseClass, Promise<V>>,
  ): Promise<V> {
    if (namespace && !namespace.trim()) {
      throw new Error('namespace must not be blank');
    }

    const builder: KindExecutionBuilder = new KindExecutionBuilder();
    builder.executable(this.executable);
    builder.environmentVariable(
      'PATH',
      `${this.installationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
    );
    request.apply(builder);
    const execution: KindExecution = builder.build();
    return responseFunction(execution, responseClass);
  }
}
