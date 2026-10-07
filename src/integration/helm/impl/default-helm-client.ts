// SPDX-License-Identifier: Apache-2.0

// Define BiFunction type for TypeScript
import {type UnInstallChartOptions} from '../model/install/un-install-chart-options.js';
import {type HelmClient} from '../helm-client.js';
import {type HelmExecution} from '../execution/helm-execution.js';
import {HelmExecutionBuilder} from '../execution/helm-execution-builder.js';
import {type Chart} from '../model/chart.js';
import {Repository} from '../model/repository.js';
import {Version} from '../model/version.js';
import {Release} from '../model/chart/release.js';
import {type InstallChartOptions} from '../model/install/install-chart-options.js';
import {type UpgradeChartOptions} from '../model/upgrade/upgrade-chart-options.js';
import {ReleaseItem} from '../model/release/release-item.js';
import {type TestChartOptions} from '../model/test/test-chart-options.js';
import {type HelmRequest} from '../request/helm-request.js';
import {ChartDependencyUpdateRequest} from '../request/chart/chart-dependency-update-request.js';
import {ChartInstallRequest} from '../request/chart/chart-install-request.js';
import {ChartTestRequest} from '../request/chart/chart-test-request.js';
import {ChartUninstallRequest} from '../request/chart/chart-uninstall-request.js';
import {ChartUpgradeRequest} from '../request/chart/chart-upgrade-request.js';
import {VersionRequest} from '../request/common/version-request.js';
import {ReleaseListRequest} from '../request/release/release-list-request.js';
import {RepositoryAddRequest} from '../request/repository/repository-add-request.js';
import {RepositoryListRequest} from '../request/repository/repository-list-request.js';
import {RepositoryRemoveRequest} from '../request/repository/repository-remove-request.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';
import {AddRepoOptions} from '../model/add/add-repo-options.js';
import {HelmDockerAuthStaleException} from '../helm-docker-auth-stale-exception.js';
import {RepositoryUpdateRequest} from '../request/repository/repository-update-request.js';
import path from 'node:path';
import {SemanticVersion} from '../../../business/utils/semantic-version.js';
import {SubprocessEnvironment} from '../../../core/subprocess-environment.js';
import {ChartPullRequest} from '../request/chart/chart-pull-request.js';

type BiFunction<T, U, R> = (t: T, u: U) => R;

@injectable()
/**
 * The default implementation of the HelmClient interface.
 */
export class DefaultHelmClient implements HelmClient {
  /**
   * The name of the namespace argument.
   */
  private static readonly NAMESPACE_ARG_NAME: string = 'namespace';

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.HelmInstallationDirectory) private readonly installationDirectory?: string,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.HelmInstallationDirectory,
      this.constructor.name,
    );
  }

  private readonly ERROR_401_REGEX: RegExp = /\b401\b.*\bunauthorized\b/i;
  private readonly ERROR_403_REGEX: RegExp = /\b401\b.*\bunauthorized\b/i;

  public async version(): Promise<SemanticVersion<string>> {
    const request: VersionRequest = new VersionRequest();
    const builder: HelmExecutionBuilder = new HelmExecutionBuilder();
    this.applyBuilderDefaults(builder);
    request.apply(builder);
    const execution: HelmExecution = builder.build();
    if (execution instanceof Promise) {
      throw new TypeError('Unexpected async execution');
    }
    const versionClass: typeof Version = Version;
    const result: Version = await execution.responseAs(versionClass);
    if (!(result instanceof Version)) {
      throw new TypeError('Unexpected response type');
    }

    const semanticVersion: SemanticVersion<string> = result.asSemanticVersion();

    this.logger.showUser(`helm version: ${semanticVersion.toString()}`);

    return semanticVersion;
  }

  public async listRepositories(): Promise<Repository[]> {
    return this.executeAsList(new RepositoryListRequest(), Repository);
  }

  public async addRepository(repository: Repository, options?: AddRepoOptions): Promise<void> {
    await this.executeAsync(new RepositoryAddRequest(repository, options));
  }

  public async removeRepository(repository: Repository): Promise<void> {
    await this.executeAsync(new RepositoryRemoveRequest(repository));
  }

  public async installChart(releaseName: string, chart: Chart, options: InstallChartOptions): Promise<Release> {
    const release: typeof Release = Release;
    const request: ChartInstallRequest = new ChartInstallRequest(releaseName, chart, options);
    return this.executeInternal(options.namespace, request, release, async (execution): Promise<Release> => {
      return await execution.responseAs(release);
    });
  }

  public async uninstallChart(releaseName: string, options: UnInstallChartOptions): Promise<void> {
    await this.executeAsync(new ChartUninstallRequest(releaseName, options));
  }

  public async testChart(releaseName: string, options: TestChartOptions): Promise<void> {
    await this.executeAsync(new ChartTestRequest(releaseName, options));
  }

  public async listReleases(allNamespaces: boolean, namespace?: string, kubeContext?: string): Promise<ReleaseItem[]> {
    return this.executeAsList(new ReleaseListRequest(allNamespaces, namespace, kubeContext), ReleaseItem);
  }

  public async dependencyUpdate(chartName: string): Promise<void> {
    await this.executeAsync(new ChartDependencyUpdateRequest(chartName));
  }

  public async upgradeChart(releaseName: string, chart: Chart, options: UpgradeChartOptions): Promise<Release> {
    const request: ChartUpgradeRequest = new ChartUpgradeRequest(releaseName, chart, options);
    return this.executeInternal(
      options.namespace,
      request,
      Release,
      async (execution: HelmExecution): Promise<Release> => execution.responseAs(Release),
    );
  }

  /**
   * Applies the default namespace and authentication configuration to the given builder.
   * @param _builder - The builder to apply to which the defaults should be applied
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private applyBuilderDefaults(_builder: HelmExecutionBuilder): void {}

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
  private async executeAsList<T extends HelmRequest, R>(
    request: T,
    responseClass: new (...arguments_: any[]) => R,
  ): Promise<R[]> {
    return this.executeInternal(undefined, request, responseClass, async (b): Promise<R[]> => {
      return await b.responseAsList(responseClass);
    });
  }

  private async executeInternal<T extends HelmRequest, R, V>(
    namespace: string | undefined,
    request: T,
    responseClass: new (...arguments_: any[]) => R,
    responseFunction: BiFunction<HelmExecution, typeof responseClass, Promise<V>>,
  ): Promise<V> {
    if (namespace && !namespace.trim()) {
      throw new Error('namespace must not be blank');
    }

    const builder: HelmExecutionBuilder = new HelmExecutionBuilder();

    this.applyBuilderDefaults(builder);

    request.apply(builder);

    if (namespace) {
      builder.argument(DefaultHelmClient.NAMESPACE_ARG_NAME, namespace);
    }

    builder.environmentVariable(
      'PATH',
      `${this.installationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
    );
    const execution: HelmExecution = builder.build();

    try {
      return await responseFunction(execution, responseClass);
    } catch (error) {
      const errorMessage: string = error?.message ?? '';

      if (!this.ERROR_401_REGEX.test(errorMessage) && !this.ERROR_403_REGEX.test(errorMessage)) {
        // Throw original for all other cases
        throw error;
      }

      this.logger.showUser(
        [
          'Detected expired Docker authentication for GHCR (ghcr.io).',
          'Fix: run one of the following and retry:',
          '  - docker logout ghcr.io',
          // eslint-disable-next-line unicorn/prefer-https
          '  - docker logout http://ghcr.io/',
        ].join('\n'),
      );

      throw new HelmDockerAuthStaleException();
    }
  }

  public async updateRepositories(): Promise<void> {
    await this.executeAsync(new RepositoryUpdateRequest());
  }

  public async pullChartPackage(
    chart: Chart,
    version: string,
    destinationDirectory: string,
    repositoryUrl?: string,
  ): Promise<void> {
    await this.executeAsync(new ChartPullRequest(chart, version, destinationDirectory, repositoryUrl));
  }
}
