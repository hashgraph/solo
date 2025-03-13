// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import {type SemanticVersion} from '../base/api/version/SemanticVersion.js';
import {type HelmClient} from '../HelmClient.js';
import {type HelmExecution} from '../execution/HelmExecution.js';
import {HelmExecutionBuilder} from '../execution/HelmExecutionBuilder.js';
import {type Chart} from '../model/Chart.js';
import {Repository} from '../model/Repository.js';
import {Version} from '../model/Version.js';
import {type Release, ReleaseImpl} from '../model/chart/Release.js';
import {type InstallChartOptions} from '../model/install/InstallChartOptions.js';
import {type ReleaseItem, ReleaseItemImpl} from '../model/release/ReleaseItem.js';
import {type TestChartOptions} from '../model/test/TestChartOptions.js';
import {type HelmRequest} from '../request/HelmRequest.js';
import {type KubeAuthentication} from '../request/authentication/KubeAuthentication.js';
import {ChartDependencyUpdateRequest} from '../request/chart/ChartDependencyUpdateRequest.js';
import {ChartInstallRequest} from '../request/chart/ChartInstallRequest.js';
import {ChartTestRequest} from '../request/chart/ChartTestRequest.js';
import {ChartUninstallRequest} from '../request/chart/ChartUninstallRequest.js';
import {ReleaseListRequest} from '../request/release/ReleaseListRequest.js';
import {RepositoryAddRequest} from '../request/repository/RepositoryAddRequest.js';
import {RepositoryListRequest} from '../request/repository/RepositoryListRequest.js';
import {RepositoryRemoveRequest} from '../request/repository/RepositoryRemoveRequest.js';

/**
 * The default implementation of the {@link HelmClient} interface.
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
   * The path to the Helm executable.
   */
  private readonly helmExecutable: string;

  /**
   * The authentication configuration to use when executing Helm commands.
   */
  private readonly authentication: KubeAuthentication;

  /**
   * The default namespace to use when executing Helm commands.
   */
  private readonly defaultNamespace?: string;

  /**
   * The working directory to use when executing Helm commands.
   */
  private readonly workingDirectory?: string;

  /**
   * Creates a new instance of the {@link DefaultHelmClient} class.
   *
   * @param helmExecutable   the path to the Helm executable.
   * @param authentication   the authentication configuration to use when executing Helm commands.
   * @param defaultNamespace the default namespace to use when executing Helm commands.
   */
  constructor(helmExecutable: string, authentication: KubeAuthentication, defaultNamespace?: string);

  /**
   * Creates a new instance of the {@link DefaultHelmClient} class.
   *
   * @param helmExecutable   the path to the Helm executable.
   * @param authentication   the authentication configuration to use when executing Helm commands.
   * @param defaultNamespace the default namespace to use when executing Helm commands.
   * @param workingDirectory the working directory to use when executing Helm commands.
   */
  constructor(
    helmExecutable: string,
    authentication: KubeAuthentication,
    defaultNamespace?: string,
    workingDirectory?: string,
  );

  constructor(
    helmExecutable: string,
    authentication: KubeAuthentication,
    defaultNamespace?: string,
    workingDirectory?: string,
  ) {
    if (!helmExecutable) {
      throw new Error('helmExecutable must not be null');
    }
    if (!authentication) {
      throw new Error('authentication must not be null');
    }
    this.helmExecutable = path.normalize(helmExecutable);
    this.authentication = authentication;
    this.defaultNamespace = defaultNamespace;
    this.workingDirectory = workingDirectory;
  }

  version(): SemanticVersion {
    const execution = new HelmExecutionBuilder(this.helmExecutable).subcommands('version').build();
    const version = execution.standardOutputSync();
    return new Version(version).asSemanticVersion();
  }

  async listRepositories(): Promise<Repository[]> {
    return this.executeAsList(new RepositoryListRequest(), Repository);
  }

  async addRepository(repository: Repository): Promise<void> {
    await this.executeInternal(new RepositoryAddRequest(repository), async b => {
      await b.call();
      return null;
    });
  }

  async removeRepository(repository: Repository): Promise<void> {
    await this.executeInternal(new RepositoryRemoveRequest(repository), async b => {
      await b.call();
      return null;
    });
  }

  async installChart(releaseName: string, chart: Chart): Promise<Release> {
    return this.execute(new ChartInstallRequest(releaseName, chart), ReleaseImpl);
  }

  async installChartWithOptions(releaseName: string, chart: Chart, options: InstallChartOptions): Promise<Release> {
    return this.execute(new ChartInstallRequest(releaseName, chart, options), ReleaseImpl);
  }

  async uninstallChart(releaseName: string): Promise<void> {
    await this.executeInternal(new ChartUninstallRequest(releaseName), async b => {
      await b.call();
      return null;
    });
  }

  async testChart(releaseName: string, options: TestChartOptions): Promise<void> {
    await this.executeInternal(new ChartTestRequest(releaseName, options), async b => {
      await b.call();
      return null;
    });
  }

  async listReleases(allNamespaces: boolean): Promise<ReleaseItem[]> {
    return this.executeAsList(new ReleaseListRequest(allNamespaces), ReleaseItemImpl);
  }

  async dependencyUpdate(chartName: string): Promise<void> {
    await this.executeInternal(new ChartDependencyUpdateRequest(chartName), async b => {
      await b.call();
      return null;
    });
  }

  /**
   * Applies the default namespace and authentication configuration to the given builder.
   *
   * @param builder the builder to apply to which the defaults should be applied.
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
   * Executes the given request and returns the response as the given class. The request is executed using the default
   * namespace.
   *
   * @param request       the request to execute.
   * @param responseClass the class of the response.
   * @param <T>           the type of the request.
   * @param <R>           the type of the response.
   * @return the response.
   */
  private async execute<T extends HelmRequest, R>(request: T, responseClass: new (...args: any[]) => R): Promise<R> {
    return this.executeInternal(request, async b => b.responseAs(responseClass));
  }

  /**
   * Executes the given request and returns the response as a list of the given class. The request is executed using
   * the default namespace.
   *
   * @param request       the request to execute.
   * @param responseClass the class of the response.
   * @param <T>           the type of the request.
   * @param <R>           the type of the response.
   * @return a list of response objects.
   */
  private async executeAsList<T extends HelmRequest, R>(
    request: T,
    responseClass: new (...args: any[]) => R,
  ): Promise<R[]> {
    return this.executeInternal(request, async b => b.responseAsList(responseClass));
  }

  /**
   * Executes the given request and returns the response as the given class with the specified namespace.
   *
   * @param namespace     the namespace to use.
   * @param request       the request to execute.
   * @param responseClass the class of the response.
   * @param <T>           the type of the request.
   * @param <R>           the type of the response.
   * @return the response.
   */
  private async executeWithNamespace<T extends HelmRequest, R>(
    namespace: string,
    request: T,
    responseClass: new (...args: any[]) => R,
  ): Promise<R> {
    return this.executeInternalWithNamespace(namespace, request, async b => b.responseAs(responseClass));
  }

  /**
   * Executes the given request and returns the response as a list of the given class with the specified namespace.
   *
   * @param namespace     the namespace to use.
   * @param request       the request to execute.
   * @param responseClass the class of the response.
   * @param <T>           the type of the request.
   * @param <R>           the type of the response.
   * @return a list of response objects.
   */
  private async executeAsListWithNamespace<T extends HelmRequest, R>(
    namespace: string,
    request: T,
    responseClass: new (...args: any[]) => R,
  ): Promise<R[]> {
    return this.executeInternalWithNamespace(namespace, request, async b => b.responseAsList(responseClass));
  }

  private async executeInternal<T extends HelmRequest, V>(
    request: T,
    responseFn: (execution: HelmExecution) => Promise<V>,
  ): Promise<V> {
    const builder = new HelmExecutionBuilder(this.helmExecutable);
    this.applyBuilderDefaults(builder);
    request.apply(builder);
    const execution = builder.build();
    return responseFn(execution);
  }

  private async executeInternalWithNamespace<T extends HelmRequest, V>(
    namespace: string,
    request: T,
    responseFn: (execution: HelmExecution) => Promise<V>,
  ): Promise<V> {
    if (!namespace) {
      throw new Error(DefaultHelmClient.MSG_NAMESPACE_NOT_NULL);
    }
    const builder = new HelmExecutionBuilder(this.helmExecutable);
    this.applyBuilderDefaults(builder);
    builder.argument(DefaultHelmClient.NAMESPACE_ARG_NAME, namespace);
    request.apply(builder);
    const execution = builder.build();
    return responseFn(execution);
  }
}
