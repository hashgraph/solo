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
import { constants, type Helm } from './index.ts'
import chalk from 'chalk'
import { SoloError } from './errors.ts'
import { type SoloLogger } from './logging.ts'

export class ChartManager {
  constructor (private readonly helm: Helm, private readonly logger: SoloLogger) {
    if (!logger) throw new Error('An instance of core/SoloLogger is required')
    if (!helm) throw new Error('An instance of core/Helm is required')
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
  async setup (repoURLs: Map<string, string> = constants.DEFAULT_CHART_REPO, force = true) {
    try {
      const forceUpdateArg = force ? '--force-update' : ''

      const promises: Promise<string>[] = []
      for (const [name, url] of repoURLs.entries()) {
        promises.push(this.addRepo(name, url, forceUpdateArg))
      }

      return await Promise.all(promises) // urls
    } catch (e: Error | any) {
      throw new SoloError(`failed to setup chart repositories: ${e.message}`, e)
    }
  }

  async addRepo (name: string, url: string, forceUpdateArg: string) {
    this.logger.debug(`Adding repo ${name} -> ${url}`, { repoName: name, repoURL: url })
    await this.helm.repo('add', name, url, forceUpdateArg)
    return url
  }

  /** List available clusters */
  async getInstalledCharts (namespaceName: string) {
    try {
      return await this.helm.list(`-n ${namespaceName}`, '--no-headers | awk \'{print $1 " [" $9"]"}\'')
    } catch (e: Error | any) {
      this.logger.showUserError(e)
    }

    return []
  }

  async install (namespaceName: string, chartReleaseName: string, chartPath: string, version: string, valuesArg = '') {
    try {
      const isInstalled = await this.isChartInstalled(namespaceName, chartReleaseName)
      if (!isInstalled) {
        const versionArg = version  ? `--version ${version}` : ''
        const namespaceArg = namespaceName ? `-n ${namespaceName} --create-namespace` : ''

        this.logger.debug(`> installing chart:${chartPath}`)
        await this.helm.install(`${chartReleaseName} ${chartPath} ${versionArg} ${namespaceArg} ${valuesArg}`)
        this.logger.debug(`OK: chart is installed: ${chartReleaseName} (${chartPath})`)
      } else {
        this.logger.debug(`OK: chart is already installed:${chartReleaseName} (${chartPath})`)
      }
    } catch (e: Error | any) {
      throw new SoloError(`failed to install chart ${chartReleaseName}: ${e.message}`, e)
    }

    return true
  }

  async isChartInstalled (namespaceName: string, chartReleaseName: string) {
    this.logger.debug(`> checking if chart is installed [ chart: ${chartReleaseName}, namespace: ${namespaceName} ]`)

    const charts = await this.getInstalledCharts(namespaceName)

    return charts.some(item => item.startsWith(chartReleaseName))
  }

  async uninstall (namespaceName: string, chartReleaseName: string) {
    try {
      const isInstalled = await this.isChartInstalled(namespaceName, chartReleaseName)
      if (isInstalled) {
        this.logger.debug(`uninstalling chart release: ${chartReleaseName}`)

        await this.helm.uninstall(`-n ${namespaceName} ${chartReleaseName}`)

        this.logger.debug(`OK: chart release is uninstalled: ${chartReleaseName}`)
      } else {
        this.logger.debug(`OK: chart release is already uninstalled: ${chartReleaseName}`)
      }
    } catch (e: Error | any) {
      throw new SoloError(`failed to uninstall chart ${chartReleaseName}: ${e.message}`, e)
    }

    return true
  }

  async upgrade (namespaceName: string, chartReleaseName: string, chartPath: string, valuesArg ='', version = '') {
    const versionArg = version ? `--version ${version}` : ''

    try {
      this.logger.debug(chalk.cyan('> upgrading chart:'), chalk.yellow(`${chartReleaseName}`))

      await this.helm.upgrade(`-n ${namespaceName} ${chartReleaseName} ${chartPath} ${versionArg} --reuse-values ${valuesArg}`)

      this.logger.debug(chalk.green('OK'), `chart '${chartReleaseName}' is upgraded`)
    } catch (e: Error | any) {
      throw new SoloError(`failed to upgrade chart ${chartReleaseName}: ${e.message}`, e)
    }

    return true
  }
}
