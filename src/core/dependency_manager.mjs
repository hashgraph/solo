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
import fs from 'fs'
import path from 'path'
import { FullstackTestingError, MissingArgumentError } from './errors.mjs'
import { constants } from './index.mjs'
import * as core from './index.mjs'
import * as helpers from './helpers.mjs'
import { ShellRunner } from './shell_runner.mjs'

export class DependencyManager extends ShellRunner {
  static HELM_INSTALLER = 'https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3'

  static depVersions = new Map()
    .set(constants.HELM, 'v3.12.3')

  constructor (logger, downloader) {
    super(logger)

    if (!downloader) throw new MissingArgumentError('An instance of core/PackageDownloader is required')
    this.downloader = downloader

    // map of dependency checks
    this.checks = new Map()
      .set(core.constants.HELM, () => this.checkHelm())

    // map of dependency installer
    this.installers = new Map()
      .set(core.constants.HELM, () => this.installHelm())
  }

  /**
   * Check if 'helm' CLI program is installed or not
   * @returns {Promise<boolean>}
   */
  async checkHelm () {
    try {
      const output = await this.run(`${core.constants.HELM} version --short`)
      const parts = output[0].split('+')
      this.logger.debug(`Found dependency ${constants.HELM}:${parts[0]}`)
      return helpers.compareVersion(DependencyManager.depVersions.get(constants.HELM), parts[0]) >= 0
    } catch (e) {
      this.logger.error(`failed to check helm dependency:${e.message}`, e)
    }

    return false
  }

  async downloadInstaller (fileURL, downloadPath) {
    this.logger.debug(`Downloading from: ${fileURL}`)
    const downloadDir = path.dirname(downloadPath)

    try {
      if (fs.existsSync(downloadPath)) {
        return true
      }

      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true })
      }

      await this.downloader.fetchFile(fileURL, downloadPath)

      return true
    } catch (e) {
      throw new FullstackTestingError(`failed to download: ${fileURL}`, e)
    }
  }

  async installHelm () {
    try {
      const helmInstaller = `${constants.SOLO_CACHE_DIR}/get-helm-3`
      if (await this.downloadInstaller(DependencyManager.HELM_INSTALLER, helmInstaller)) {
        await this.run(`chmod +x ${helmInstaller}`)
        await this.run(`${helmInstaller} --no-sudo`)
      }
      return true
    } catch (e) {
      throw new FullstackTestingError(`failed to install helm\n${e.message}\n\nRun 'solo init' with sudo/root access [e.g. sudo solo init]`, e)
    }
  }

  /**
   * Check if the required dependency is installed or not
   * @param dep is the name of the program
   * @returns {Promise<boolean>}
   */
  async checkDependency (dep) {
    this.logger.debug(`Checking for dependency: ${dep}`)

    let status = false
    const check = this.checks.get(dep)
    if (check) {
      status = await check()
    }

    this.logger.debug(`Dependency ${dep} is found`)
    return status
  }

  taskCheckDependencies (deps = [], install = true) {
    const subTasks = []
    deps.forEach(dep => {
      subTasks.push({
        title: `Check dependency: ${dep}`,
        task: async (_, task) => {
          if (!await this.checkDependency(dep)) {
            if (!install) {
              throw new FullstackTestingError(`${dep} is not installed.`)
            }

            const installer = this.installers.get(dep)
            await installer()
          }
        }
      })
    })

    return subTasks
  }
}
