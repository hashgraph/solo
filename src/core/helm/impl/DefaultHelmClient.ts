// SPDX-License-Identifier: Apache-2.0

// Define BiFunction type for TypeScript
type BiFunction<T, U, R> = (t: T, u: U) => R;

import {type HelmClient} from '../HelmClient.js';
import {type HelmExecution} from '../execution/HelmExecution.js';
import {HelmExecutionBuilder} from '../execution/HelmExecutionBuilder.js';
import {type Chart} from '../model/Chart.js';
import {Repository} from '../model/Repository.js';
import {Version} from '../model/Version.js';
import {type Release} from '../model/chart/Release.js';
import {InstallChartOptions} from '../model/install/InstallChartOptions.js';
import {ReleaseItem} from '../model/release/ReleaseItem.js';
import {type TestChartOptions} from '../model/test/TestChartOptions.js';
import {type HelmRequest} from '../request/HelmRequest.js';
import {type KubeAuthentication} from '../request/authentication/KubeAuthentication.js';
import {ChartDependencyUpdateRequest} from '../request/chart/ChartDependencyUpdateRequest.js';
import {ChartInstallRequest} from '../request/chart/ChartInstallRequest.js';
import {ChartTestRequest} from '../request/chart/ChartTestRequest.js';
import {ChartUninstallRequest} from '../request/chart/ChartUninstallRequest.js';
import {VersionRequest} from '../request/common/VersionRequest.js';
import {ReleaseListRequest} from '../request/release/ReleaseListRequest.js';
import {RepositoryAddRequest} from '../request/repository/RepositoryAddRequest.js';
import {RepositoryListRequest} from '../request/repository/RepositoryListRequest.js';
import {RepositoryRemoveRequest} from '../request/repository/RepositoryRemoveRequest.js';
import {type SemanticVersion} from '../base/api/version/SemanticVersion.js';

/**
 * The default implementation of the HelmClient interface.
 */
export class DefaultHelmClient implements HelmClient {
  /**
   * The message to use when the namespace is null.
   */
  private static readonly MSG_NAMESPACE_NOT_NULL = 'namespace must not be null';

  /**
   * The name of the namespace argument.
   */
  private static readonly NAMESPACE_ARG_NAME = 'namespace';

  /**
   * Creates a new instance of the DefaultHelmClient class.
   * @param helmExecutable - The path to the Helm executable
   * @param authentication - The authentication configuration to use when executing Helm commands
   * @param defaultNamespace - The default namespace to use when executing Helm commands
   * @param workingDirectory - The working directory to use when executing Helm commands
   */
  constructor(
    private readonly helmExecutable: string,
    private readonly authentication: KubeAuthentication,
    private readonly defaultNamespace?: string,
    private readonly workingDirectory?: string,
  ) {
    if (!helmExecutable) {
      throw new Error('helmExecutable must not be null');
    }
    if (!authentication) {
      throw new Error('authentication must not be null');
    }
  }

  public async version(): Promise<SemanticVersion> {
    const request = new VersionRequest();
    const builder = new HelmExecutionBuilder(this.helmExecutable);
    this.applyBuilderDefaults(builder);
    request.apply(builder);
    const execution = builder.build();
    if (execution instanceof Promise) {
      throw new Error('Unexpected async execution');
    }
    const versionClass = Version as unknown as new () => Version;
    const result = await execution.responseAs(versionClass);
    if (!(result instanceof Version)) {
      throw new Error('Unexpected response type');
    }
    return result.asSemanticVersion();
  }

  public async listRepositories(): Promise<Repository[]> {
    return this.executeAsList(new RepositoryListRequest(), Repository);
  }

  public async addRepository(repository: Repository): Promise<void> {
    await this.executeAsync(new RepositoryAddRequest(repository), undefined);
  }

  public async removeRepository(repository: Repository): Promise<void> {
    await this.executeAsync(new RepositoryRemoveRequest(repository), undefined);
  }

  public async installChart(
    releaseName: string,
    chart: Chart,
    options: InstallChartOptions = InstallChartOptions.defaults(),
  ): Promise<Release> {
    return await this.installChartWithOptions(releaseName, chart, options);
  }

  public async installChartWithOptions(
    releaseName: string,
    chart: Chart,
    options: InstallChartOptions,
  ): Promise<Release> {
    const request = new ChartInstallRequest(releaseName, chart, options);
    return this.executeInternal(undefined, request, {} as any, async execution => {
      const response = await execution.responseAs({} as any);
      return response as Release;
    });
  }

  public async uninstallChart(releaseName: string): Promise<void> {
    await this.executeAsync(new ChartUninstallRequest(releaseName), undefined);
  }

  public async testChart(releaseName: string, options: TestChartOptions): Promise<void> {
    await this.executeAsync(new ChartTestRequest(releaseName, options), undefined);
  }

  public async listReleases(allNamespaces: boolean): Promise<ReleaseItem[]> {
    return this.executeAsList(new ReleaseListRequest(allNamespaces), ReleaseItem);
  }

  public async dependencyUpdate(chartName: string): Promise<void> {
    await this.executeAsync(new ChartDependencyUpdateRequest(chartName), undefined);
  }

  /**
   * Applies the default namespace and authentication configuration to the given builder.
   * @param builder - The builder to apply to which the defaults should be applied
   */
  private applyBuilderDefaults(builder: HelmExecutionBuilder): void {
    if (this.defaultNamespace?.trim()) {
      builder.argument(DefaultHelmClient.NAMESPACE_ARG_NAME, this.defaultNamespace);
    }

    if (this.workingDirectory) {
      builder.workingDirectory(this.workingDirectory);
    }

    this.authentication.apply(builder);
  }

  /**
   * Executes the given request and returns the response as the given class.
   * The request is executed using the default namespace.
   *
   * @param request - The request to execute
   * @param responseClass - The class of the response
   * @returns The response
   */
  private async executeAsync<T extends HelmRequest, R>(
    request: T,
    responseClass: new (...args: any[]) => R,
  ): Promise<R> {
    return this.executeInternal(undefined, request, responseClass, async b => {
      const response = await b.responseAs(responseClass);
      return response as R;
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
  private async executeAsList<T extends HelmRequest, R>(
    request: T,
    responseClass: new (...args: any[]) => R,
  ): Promise<R[]> {
    return this.executeInternal(undefined, request, responseClass, async b => {
      const response = await b.responseAsList(responseClass);
      return response as R[];
    });
  }

  private async executeInternal<T extends HelmRequest, R, V>(
    namespace: string | undefined,
    request: T,
    responseClass: new (...args: any[]) => R,
    responseFn: BiFunction<HelmExecution, typeof responseClass, Promise<V>>,
  ): Promise<V> {
    if (namespace && !namespace.trim()) {
      throw new Error('namespace must not be blank');
    }

    const builder = new HelmExecutionBuilder(this.helmExecutable);
    this.applyBuilderDefaults(builder);
    request.apply(builder);
    if (namespace) {
      builder.argument(DefaultHelmClient.NAMESPACE_ARG_NAME, namespace);
    }
    const execution = builder.build();
    return responseFn(execution, responseClass);
  }
}
