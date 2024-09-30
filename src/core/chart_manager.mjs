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
'use strict'
import { constants } from './index.mjs'
import chalk from 'chalk'
import { FullstackTestingError } from './errors.mjs'

export class ChartManager {
  /**
   * @param {Helm} helm
   * @param {Logger} logger
   */
  constructor (helm, logger) {
    if (!logger) throw new Error('An instance of core/Logger is required')
    if (!helm) throw new Error('An instance of core/Helm is required')

    this.logger = logger
    this.helm = helm
  }

  /**
   * Setup chart repositories
   *
   * This must be invoked before calling other methods
   *
   * @param {Map<string, string>} repoURLs - a map of name and chart repository URLs
   * @param {boolean} force - whether or not to update the repo
   * @returns {Promise<string[]>} - returns the urls
   */
  async setup (repoURLs = constants.DEFAULT_CHART_REPO, force = true) {
    try {
      const forceUpdateArg = force ? '--force-update' : ''

      /** @type {Array<Promise<string>>} */
      const promises = []
      for (const [name, url] of repoURLs.entries()) {
        promises.push(this.addRepo(name, url, forceUpdateArg))
      }

      return await Promise.all(promises) // urls
    } catch (e) {
      throw new FullstackTestingError(`failed to setup chart repositories: ${e.message}`, e)
    }
  }

  /**
   * @param {string} name
   * @param {string} url
   * @param {string} forceUpdateArg
   * @returns {Promise<string>}
   */
  async addRepo (name, url, forceUpdateArg) {
    this.logger.debug(`Adding repo ${name} -> ${url}`, { repoName: name, repoURL: url })
    await this.helm.repo('add', name, url, forceUpdateArg)
    return url
  }

  /**
   * List available clusters
   * @param {string} namespaceName
   * @returns {Promise<string[]>}
   */
  async getInstalledCharts (namespaceName) {
    try {
      return await this.helm.list(`-n ${namespaceName}`, '--no-headers | awk \'{print $1 " [" $9"]"}\'')
    } catch (e) {
      this.logger.showUserError(e)
    }

    return []
  }

  /**
   * @param {string} namespaceName
   * @param {string} chartReleaseName
   * @param {string} chartPath
   * @param {string} version
   * @param {string} valuesArg
   * @returns {Promise<boolean>}
   */
  async install (namespaceName, chartReleaseName, chartPath, version, valuesArg = '') {
    try {
      const isInstalled = await this.isChartInstalled(namespaceName, chartReleaseName)
      if (!isInstalled) {
        let versionArg = ''
        if (version) {
          versionArg = `--version ${version}`
        }

        let namespaceArg = ''
        if (namespaceName) {
          namespaceArg = `-n ${namespaceName} --create-namespace`
        }

        this.logger.debug(`> installing chart:${chartPath}`)
        await this.helm.install(`${chartReleaseName} ${chartPath} ${versionArg} ${namespaceArg} ${valuesArg}`)
        this.logger.debug(`OK: chart is installed: ${chartReleaseName} (${chartPath})`)
      } else {
        this.logger.debug(`OK: chart is already installed:${chartReleaseName} (${chartPath})`)
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to install chart ${chartReleaseName}: ${e.message}`, e)
    }

    return true
  }

  /**
   * @param {string} namespaceName
   * @param {string} chartReleaseName
   * @returns {Promise<boolean>}
   */
  async isChartInstalled (namespaceName, chartReleaseName) {
    this.logger.debug(`> checking if chart is installed [ chart: ${chartReleaseName}, namespace: ${namespaceName} ]`)
    const charts = await this.getInstalledCharts(namespaceName)
    for (const item of charts) {
      if (item.startsWith(chartReleaseName)) {
        return true
      }
    }

    return false
  }

  /**
   * @param {string} namespaceName
   * @param {string} chartReleaseName
   * @returns {Promise<boolean>}
   */
  async uninstall (namespaceName, chartReleaseName) {
    try {
      const isInstalled = await this.isChartInstalled(namespaceName, chartReleaseName)
      if (isInstalled) {
        this.logger.debug(`uninstalling chart release: ${chartReleaseName}`)
        await this.helm.uninstall(`-n ${namespaceName} ${chartReleaseName}`)
        this.logger.debug(`OK: chart release is uninstalled: ${chartReleaseName}`)
      } else {
        this.logger.debug(`OK: chart release is already uninstalled: ${chartReleaseName}`)
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to uninstall chart ${chartReleaseName}: ${e.message}`, e)
    }

    return true
  }

  /**
   * @param {string} namespaceName
   * @param {string} chartReleaseName
   * @param {string} chartPath
   * @param {string} valuesArg
   * @param {string} version
   * @returns {Promise<boolean>}
   */
  async upgrade (namespaceName, chartReleaseName, chartPath, valuesArg = '', version = '') {
    let versionArg = ''
    if (version) {
      versionArg = `--version ${version}`
    }

    try {
      this.logger.debug(chalk.cyan('> upgrading chart:'), chalk.yellow(`${chartReleaseName}`))
      await this.helm.upgrade(`-n ${namespaceName} ${chartReleaseName} ${chartPath} ${versionArg} --reuse-values ${valuesArg}`)
      this.logger.debug(chalk.green('OK'), `chart '${chartReleaseName}' is upgraded`)
    } catch (e) {
      throw new FullstackTestingError(`failed to upgrade chart ${chartReleaseName}: ${e.message}`, e)
    }

    return true
  }
}
