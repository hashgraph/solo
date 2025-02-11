/**
 * SPDX-License-Identifier: Apache-2.0
 */
import * as constants from './constants.js';
import {type Helm} from './helm.js';
import chalk from 'chalk';
import {SoloError} from './errors.js';
import {type SoloLogger} from './logging.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency_injection/container_helper.js';
import {type NamespaceName} from './kube/resources/namespace/namespace_name.js';
import {InjectTokens} from './dependency_injection/inject_tokens.js';

@injectable()
export class ChartManager {
  constructor(
    @inject(InjectTokens.Helm) private readonly helm?: Helm,
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
      const forceUpdateArg = force ? '--force-update' : '';

      const promises: Promise<string>[] = [];
      for (const [name, url] of repoURLs.entries()) {
        promises.push(this.addRepo(name, url, forceUpdateArg));
      }

      return await Promise.all(promises); // urls
    } catch (e: Error | any) {
      throw new SoloError(`failed to setup chart repositories: ${e.message}`, e);
    }
  }

  async addRepo(name: string, url: string, forceUpdateArg: string) {
    this.logger.debug(`Adding repo ${name} -> ${url}`, {repoName: name, repoURL: url});
    await this.helm.repo('add', name, url, forceUpdateArg);
    return url;
  }

  /** List available clusters */
  async getInstalledCharts(namespaceName: NamespaceName) {
    try {
      if (!namespaceName) {
        return await this.helm.list('--all-namespaces --no-headers | awk \'{print $1 " [" $9"]"}\'');
      }
      return await this.helm.list(`-n ${namespaceName.name}`, '--no-headers | awk \'{print $1 " [" $9"]"}\'');
    } catch (e: Error | any) {
      this.logger.showUserError(e);
    }

    return [];
  }

  async install(
    namespaceName: NamespaceName,
    chartReleaseName: string,
    chartPath: string,
    version: string,
    valuesArg = '',
  ) {
    try {
      const isInstalled = await this.isChartInstalled(namespaceName, chartReleaseName);
      if (!isInstalled) {
        const versionArg = version ? `--version ${version}` : '';
        const namespaceArg = namespaceName ? `-n ${namespaceName} --create-namespace` : '';

        this.logger.debug(`> installing chart:${chartPath}`);
        await this.helm.install(`${chartReleaseName} ${chartPath} ${versionArg} ${namespaceArg} ${valuesArg}`);
        this.logger.debug(`OK: chart is installed: ${chartReleaseName} (${chartPath})`);
      } else {
        this.logger.debug(`OK: chart is already installed:${chartReleaseName} (${chartPath})`);
      }
    } catch (e: Error | any) {
      throw new SoloError(`failed to install chart ${chartReleaseName}: ${e.message}`, e);
    }

    return true;
  }

  async isChartInstalled(namespaceName: NamespaceName, chartReleaseName: string) {
    this.logger.debug(`> checking if chart is installed [ chart: ${chartReleaseName}, namespace: ${namespaceName} ]`);
    const charts = await this.getInstalledCharts(namespaceName);

    return charts.some(item => item.startsWith(chartReleaseName));
  }

  async uninstall(namespaceName: NamespaceName, chartReleaseName: string) {
    try {
      const isInstalled = await this.isChartInstalled(namespaceName, chartReleaseName);
      if (isInstalled) {
        this.logger.debug(`uninstalling chart release: ${chartReleaseName}`);
        await this.helm.uninstall(`-n ${namespaceName} ${chartReleaseName}`);
        this.logger.debug(`OK: chart release is uninstalled: ${chartReleaseName}`);
      } else {
        this.logger.debug(`OK: chart release is already uninstalled: ${chartReleaseName}`);
      }
    } catch (e: Error | any) {
      throw new SoloError(`failed to uninstall chart ${chartReleaseName}: ${e.message}`, e);
    }

    return true;
  }

  async upgrade(
    namespaceName: NamespaceName,
    chartReleaseName: string,
    chartPath: string,
    version = '',
    valuesArg = '',
  ) {
    const versionArg = version ? `--version ${version}` : '';

    try {
      this.logger.debug(chalk.cyan('> upgrading chart:'), chalk.yellow(`${chartReleaseName}`));
      await this.helm.upgrade(
        `-n ${namespaceName.name} ${chartReleaseName} ${chartPath} ${versionArg} --reuse-values ${valuesArg}`,
      );
      this.logger.debug(chalk.green('OK'), `chart '${chartReleaseName}' is upgraded`);
    } catch (e: Error | any) {
      throw new SoloError(`failed to upgrade chart ${chartReleaseName}: ${e.message}`, e);
    }

    return true;
  }
}
