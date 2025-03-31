// SPDX-License-Identifier: Apache-2.0

import * as constants from './constants.js';
import chalk from 'chalk';
import {SoloError} from './errors/solo-error.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {Repository} from '../integration/helm/model/repository.js';
import {type ReleaseItem} from '../integration/helm/model/release/release-item.js';
import {UpgradeChartOptions} from '../integration/helm/model/upgrade/upgrade-chart-options.js';
import {Chart} from '../integration/helm/model/chart.js';
import {type InstallChartOptions} from '../integration/helm/model/install/install-chart-options.js';
import {InstallChartOptionsBuilder} from '../integration/helm/model/install/install-chart-options-builder.js';
import {type HelmClient} from '../integration/helm/helm-client.js';
import {UnInstallChartOptionsBuilder} from '../integration/helm/model/install/un-install-chart-options-builder.js';

@injectable()
export class ChartManager {
  constructor(
    @inject(InjectTokens.Helm) private readonly helm?: HelmClient,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
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
  async setup(repoURLs: Map<string, string> = constants.DEFAULT_CHART_REPO, force = true) {
    try {
      const forceUpdateArgument = force ? '--force-update' : '';

      const promises: Promise<string>[] = [];
      for (const [name, url] of repoURLs.entries()) {
        promises.push(this.addRepo(name, url, forceUpdateArgument));
      }

      return await Promise.all(promises); // urls
    } catch (error: Error | any) {
      throw new SoloError(`failed to setup chart repositories: ${error.message}`, error);
    }
  }

  async addRepo(name: string, url: string, forceUpdateArgument: string) {
    this.logger.debug(`Adding repo ${name} -> ${url}`, {repoName: name, repoURL: url});
    await this.helm.addRepository(new Repository(name, url));
    return url;
  }

  /** List available clusters
   *
   * @param namespaceName - the namespace name
   * @param kubeContext - the kube context
   */
  async getInstalledCharts(namespaceName: NamespaceName, kubeContext?: string) {
    try {
      const result: ReleaseItem[] = await this.helm.listReleases(!namespaceName, namespaceName?.name, kubeContext);
      // convert to string[]
      return result.map(release => `${release.name} [${release.chart}]`);
    } catch (error: Error | any) {
      this.logger.showUserError(error);
    }
    return [];
  }

  async install(
    namespaceName: NamespaceName,
    chartReleaseName: string,
    chartName: string,
    repoName: string,
    version: string,
    valuesArgument = '',
    kubeContext: string,
  ) {
    try {
      const isInstalled = await this.isChartInstalled(namespaceName, chartReleaseName, kubeContext);
      if (!isInstalled) {
        this.logger.debug(`> installing chart:${chartName}`);
        const builder = InstallChartOptionsBuilder.builder()
          .version(version)
          .kubeContext(kubeContext)
          .extraArgs(valuesArgument);
        if (namespaceName) {
          builder.createNamespace(true);
          builder.namespace(namespaceName.name);
        }
        const options: InstallChartOptions = builder.build();
        await this.helm.installChart(chartReleaseName, new Chart(chartName, repoName), options);
        this.logger.debug(`OK: chart is installed: ${chartReleaseName} (${chartName}) (${repoName})`);
      } else {
        this.logger.debug(`OK: chart is already installed:${chartReleaseName} (${chartName}) (${repoName})`);
      }
    } catch (error: Error | any) {
      throw new SoloError(`failed to install chart ${chartReleaseName}: ${error.message}`, error);
    }

    return true;
  }

  async isChartInstalled(namespaceName: NamespaceName, chartReleaseName: string, kubeContext?: string) {
    this.logger.debug(
      `> checking if chart is installed [ chart: ${chartReleaseName}, namespace: ${namespaceName}, kubeContext: ${kubeContext} ]`,
    );
    const charts = await this.getInstalledCharts(namespaceName, kubeContext);

    return charts.some(item => item.startsWith(chartReleaseName));
  }

  async uninstall(namespaceName: NamespaceName, chartReleaseName: string, kubeContext?: string) {
    try {
      const isInstalled = await this.isChartInstalled(namespaceName, chartReleaseName, kubeContext);
      if (isInstalled) {
        this.logger.debug(`uninstalling chart release: ${chartReleaseName}`);
        const options = UnInstallChartOptionsBuilder.builder()
          .namespace(namespaceName.name)
          .kubeContext(kubeContext)
          .build();
        await this.helm.uninstallChart(chartReleaseName, options);
        this.logger.debug(`OK: chart release is uninstalled: ${chartReleaseName}`);
      } else {
        this.logger.debug(`OK: chart release is already uninstalled: ${chartReleaseName}`);
      }
    } catch (error: Error | any) {
      throw new SoloError(`failed to uninstall chart ${chartReleaseName}: ${error.message}`, error);
    }

    return true;
  }

  async upgrade(
    namespaceName: NamespaceName,
    chartReleaseName: string,
    chartName: string,
    repoName: string,
    version = '',
    valuesArgument = '',
    kubeContext?: string,
  ) {
    try {
      this.logger.debug(chalk.cyan('> upgrading chart:'), chalk.yellow(`${chartReleaseName}`));
      const options: UpgradeChartOptions = new UpgradeChartOptions(
        namespaceName.name,
        kubeContext,
        true,
        valuesArgument,
        version,
      );
      const chart: Chart = new Chart(chartName, repoName);
      await this.helm.upgradeChart(chartReleaseName, chart, options);
      this.logger.debug(chalk.green('OK'), `chart '${chartReleaseName}' is upgraded`);
    } catch (error: Error | any) {
      throw new SoloError(`failed to upgrade chart ${chartReleaseName}: ${error.message}`, error);
    }

    return true;
  }
}
