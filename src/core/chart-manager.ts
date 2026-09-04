// SPDX-License-Identifier: Apache-2.0

import * as constants from './constants.js';
import chalk from 'chalk';
import {SoloErrors} from './errors/solo-errors.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {Repository} from '../integration/helm/model/repository.js';
import {type ReleaseItem} from '../integration/helm/model/release/release-item.js';
import {UpgradeChartOptions} from '../integration/helm/model/upgrade/upgrade-chart-options.js';
import {UpgradeChartOptionsBuilder} from '../integration/helm/model/upgrade/upgrade-chart-options-builder.js';
import {Chart} from '../integration/helm/model/chart.js';
import {type InstallChartOptions} from '../integration/helm/model/install/install-chart-options.js';
import {InstallChartOptionsBuilder} from '../integration/helm/model/install/install-chart-options-builder.js';
import {type HelmClient} from '../integration/helm/helm-client.js';
import {UnInstallChartOptionsBuilder} from '../integration/helm/model/install/un-install-chart-options-builder.js';
import {AddRepoOptionsBuilder} from '../integration/helm/model/add/add-repo-options-builder.js';
import {AddRepoOptions} from '../integration/helm/model/add/add-repo-options.js';
import {UnInstallChartOptions} from '../integration/helm/model/install/un-install-chart-options.js';
import {HelmChartValues} from '../integration/helm/model/values.js';
import fs from 'node:fs/promises';
import {type Stats} from 'node:fs';
import {CacheTarget} from '../integration/cache/models/impl/cache-target.js';
import {CacheArtifactEnum} from '../integration/cache/enums/cache-artifact-enum.js';
import {type CacheCatalogStore} from '../integration/cache/api/cache-catalog-store.js';
import {type CacheHealthInspector} from '../integration/cache/api/cache-health-inspector.js';

@injectable()
export class ChartManager {
  /** Log-message fragment emitted when a chart is installed or upgraded from the local chart cache. */
  public static readonly INSTALLED_FROM_CACHE_MESSAGE_FRAGMENT: string = 'from cached chart archive';

  public constructor(
    @inject(InjectTokens.Helm) private readonly helm?: HelmClient,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.CacheCatalogStore) private readonly cacheCatalogStore?: CacheCatalogStore,
    @inject(InjectTokens.CacheHealthInspector) private readonly cacheHealthInspector?: CacheHealthInspector,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.cacheCatalogStore = patchInject(cacheCatalogStore, InjectTokens.CacheCatalogStore, this.constructor.name);
    this.cacheHealthInspector = patchInject(
      cacheHealthInspector,
      InjectTokens.CacheHealthInspector,
      this.constructor.name,
    );
  }

  /**
   * Resolves the local path to a cached chart tarball for the given chart, when one is available.
   *
   * Returns undefined (so callers fall back to a normal network install) when the version is empty,
   * when {@link repoName} points to an explicit local chart directory (dev mode must not be overridden),
   * or when no matching tarball has been pulled into the cache via `solo cache chart pull`.
   */
  private async resolveCachedChartPath(
    chartName: string,
    version: string,
    repoName: string,
  ): Promise<string | undefined> {
    if (!version) {
      return undefined;
    }

    try {
      const stats: Stats = await fs.stat(repoName);
      if (stats.isDirectory()) {
        // An explicit local chart directory was provided; honor it over the cache.
        return undefined;
      }
    } catch {
      // repoName is a remote reference (repository URL, OCI reference, or alias), not a local path — continue.
    }

    const target: CacheTarget = new CacheTarget(CacheArtifactEnum.HELM_CHART, chartName, version);
    const archivePath: string = this.cacheCatalogStore.resolvePath(target, CacheArtifactEnum.HELM_CHART);

    return (await this.cacheHealthInspector.exists(archivePath)) ? archivePath : undefined;
  }

  /**
   * Setup chart repositories
   *
   * This must be invoked before calling other methods
   *
   * @param repoURLs - a map of name and chart repository URLs
   * @param force - whether or not to update the repo
   * @returns the urls
   */
  public async setup(
    repoURLs: Map<string, string> = constants.DEFAULT_CHART_REPO,
    force: boolean = true,
  ): Promise<string[]> {
    try {
      const promises: Promise<string>[] = [];
      for (const [name, url] of repoURLs.entries()) {
        this.logger.debug(`pushing promise for: add repo ${name} -> ${url}`);
        promises.push(this.addRepo(name, url, force));
      }

      const urls: string[] = await Promise.all(promises); // urls
      await this.helm.updateRepositories();
      return urls;
    } catch (error) {
      throw new SoloErrors.system.helmRepoSetupFailed(error);
    }
  }

  /**
   * Check if the required chart repositories are set up
   *
   * @param repoURLs - a map of name and chart repository URLs
   * @returns true if all repos are set up, false otherwise
   */
  public async isSetup(repoURLs: Map<string, string> = constants.DEFAULT_CHART_REPO): Promise<boolean> {
    try {
      const existingRepos: Repository[] = await this.helm.listRepositories();
      for (const [name, url] of repoURLs.entries()) {
        const found: Repository = existingRepos.find(
          (repo: Repository): boolean => repo.name === name && repo.url === url,
        );
        if (!found) {
          this.logger.debug(`Repo not found: ${name} -> ${url}`);
          return false;
        }
      }
      return true;
    } catch (error) {
      throw new SoloErrors.system.helmRepoCheckFailed(error);
    }
  }

  public async addRepo(name: string, url: string, force: boolean): Promise<string> {
    // detect if repo already exists for name provided and the url matches, if so, exit, otherwise force update
    const repositories: Repository[] = await this.helm.listRepositories();
    const existingRepo: Repository | undefined = repositories.find((repo): boolean => repo.name === name);
    if (existingRepo) {
      if (existingRepo.url === url) {
        this.logger.debug(`Repo already exists: ${name} -> ${url}`);
        return url;
      }
      this.logger.debug(`Repo URL mismatch for ${name}: existing URL is ${existingRepo.url}, new URL is ${url}`);
    }
    this.logger.debug(`Adding repo ${name} -> ${url}`, {repoName: name, repoURL: url});
    const options: AddRepoOptions = new AddRepoOptionsBuilder().forceUpdate(force).build();
    await this.helm.addRepository(new Repository(name, url), options);
    return url;
  }

  /** List available clusters
   *
   * @param namespaceName - the namespace name
   * @param kubeContext - the kube context
   */
  public async getInstalledCharts(namespaceName: NamespaceName, kubeContext?: string): Promise<string[]> {
    try {
      const result: ReleaseItem[] = await this.helm.listReleases(!namespaceName, namespaceName?.name, kubeContext);
      // convert to string[]
      return result.map((release): string => `${release.name} [${release.chart}]`);
    } catch (error) {
      this.logger.showUserError(error);
      throw new SoloErrors.system.helmChartListFailed(error);
    }
  }

  public async install(
    namespaceName: NamespaceName,
    chartReleaseName: string,
    chartName: string,
    repoName: string,
    version: string,
    chartValues: HelmChartValues,
    kubeContext: string,
    atomic: boolean = false,
    waitFor: boolean = false,
    dependencyUpdate: boolean = false,
  ): Promise<boolean> {
    try {
      const isInstalled: boolean = await this.isChartInstalled(namespaceName, chartReleaseName, kubeContext);
      if (isInstalled) {
        this.logger.debug(`OK: chart is already installed:${chartReleaseName} (${chartName}) (${repoName})`);
      } else {
        this.logger.debug(`> installing chart:${chartName}`);

        const cachedChartPath: string | undefined = await this.resolveCachedChartPath(chartName, version, repoName);

        const builder: InstallChartOptionsBuilder = InstallChartOptionsBuilder.builder()
          .kubeContext(kubeContext)
          .atomic(atomic)
          .waitFor(waitFor)
          .valueArguments(chartValues.toArguments())
          .dependencyUpdate(dependencyUpdate);

        // A local chart tarball is self-describing; `helm install` rejects `--version` for a local chart.
        if (version && !cachedChartPath) {
          builder.version(version);
        }

        if (namespaceName) {
          builder.createNamespace(true);
          builder.namespace(namespaceName.name);
        }

        const options: InstallChartOptions = builder.build();
        const chart: Chart = cachedChartPath ? new Chart(cachedChartPath) : new Chart(chartName, repoName);

        if (cachedChartPath) {
          this.logger.debug(
            `Installing ${chartName} ${ChartManager.INSTALLED_FROM_CACHE_MESSAGE_FRAGMENT}: ${cachedChartPath}`,
          );
        }

        await this.helm.installChart(chartReleaseName, chart, options);
        this.logger.debug(`OK: chart is installed: ${chartReleaseName} (${chartName}) (${repoName})`);
      }
    } catch (error) {
      throw new SoloErrors.system.helmChartGenericInstallFailed(chartReleaseName, error);
    }

    return true;
  }

  public async isChartInstalled(
    namespaceName: NamespaceName,
    chartReleaseName: string,
    kubeContext?: string,
  ): Promise<boolean> {
    return (await this.getInstalledRelease(namespaceName, chartReleaseName, kubeContext)) !== undefined;
  }

  /**
   * Returns the installed Helm release matching the given release name, or undefined when it is not installed.
   * Pass `undefined` for `namespaceName` to search across all namespaces.
   */
  public async getInstalledRelease(
    namespaceName: NamespaceName | undefined,
    chartReleaseName: string,
    kubeContext?: string,
  ): Promise<ReleaseItem | undefined> {
    this.logger.debug(
      `> checking if chart is installed [ chart: ${chartReleaseName}, namespace: ${namespaceName}, kubeContext: ${kubeContext} ]`,
    );
    try {
      const releases: ReleaseItem[] = await this.helm.listReleases(!namespaceName, namespaceName?.name, kubeContext);
      return releases.find((release: ReleaseItem): boolean => release.name === chartReleaseName);
    } catch (error) {
      this.logger.showUserError(error);
      throw new SoloErrors.system.helmChartListFailed(error);
    }
  }

  public async uninstall(
    namespaceName: NamespaceName,
    chartReleaseName: string,
    kubeContext?: string,
  ): Promise<boolean> {
    try {
      const isInstalled: boolean = await this.isChartInstalled(namespaceName, chartReleaseName, kubeContext);
      if (isInstalled) {
        this.logger.debug(`uninstalling chart release: ${chartReleaseName}`);
        const options: UnInstallChartOptions = UnInstallChartOptionsBuilder.builder()
          .namespace(namespaceName.name)
          .kubeContext(kubeContext)
          .build();
        await this.helm.uninstallChart(chartReleaseName, options);
        this.logger.debug(`OK: chart release is uninstalled: ${chartReleaseName}`);
      } else {
        this.logger.debug(`OK: chart release is already uninstalled: ${chartReleaseName}`);
      }
    } catch (error) {
      throw new SoloErrors.system.helmChartUninstallFailed(chartReleaseName, error);
    }

    return true;
  }

  public async upgrade(
    namespaceName: NamespaceName,
    chartReleaseName: string,
    chartName: string,
    repoName: string,
    version: string = '',
    chartValues: HelmChartValues,
    kubeContext: string,
    reuseValues: boolean = false,
    install: boolean = false,
    createNamespace: boolean = false,
    dependencyUpdate: boolean = false,
  ): Promise<boolean> {
    try {
      this.logger.debug(chalk.cyan('> upgrading chart:'), chalk.yellow(`${chartReleaseName}`));

      const cachedChartPath: string | undefined = await this.resolveCachedChartPath(chartName, version, repoName);

      const builder: UpgradeChartOptionsBuilder = UpgradeChartOptionsBuilder.builder()
        .reuseValues(reuseValues)
        .install(install)
        .createNamespace(createNamespace)
        .namespace(namespaceName.name)
        .kubeContext(kubeContext)
        .valueArguments(chartValues.toArguments())
        .dependencyUpdate(dependencyUpdate);

      // A local chart tarball is self-describing; `helm upgrade` rejects `--version` for a local chart.
      if (version && !cachedChartPath) {
        builder.version(version);
      }

      const options: UpgradeChartOptions = builder.build();
      const chart: Chart = cachedChartPath ? new Chart(cachedChartPath) : new Chart(chartName, repoName);

      if (cachedChartPath) {
        this.logger.debug(
          `Upgrading ${chartReleaseName} ${ChartManager.INSTALLED_FROM_CACHE_MESSAGE_FRAGMENT}: ${cachedChartPath}`,
        );
      }

      await this.helm.upgradeChart(chartReleaseName, chart, options);
      this.logger.debug(chalk.green('OK'), `chart '${chartReleaseName}' is upgraded`);
    } catch (error) {
      throw new SoloErrors.system.helmChartUpgradeFailed(chartReleaseName, error);
    }

    return true;
  }
}
