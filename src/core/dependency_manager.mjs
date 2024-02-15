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
import { FullstackTestingError } from './errors.mjs'
import { constants } from './index.mjs'
import * as core from './index.mjs'
import * as helpers from './helpers.mjs'
import { ShellRunner } from './shell_runner.mjs'

export class DependencyManager extends ShellRunner {
  static depVersions = new Map()
    .set(constants.HELM, 'v3.12.3')

  constructor (logger) {
    super(logger)

    // map of dependency checks
    this.checks = new Map()
      .set(core.constants.HELM, () => this.checkHelm())
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

    if (!status) {
      throw new FullstackTestingError(`${dep}:^${DependencyManager.depVersions.get(dep)} is not found`)
    }

    this.logger.debug(`Dependency ${dep} is found`)
    return true
  }

  taskCheckDependencies (deps = []) {
    const subTasks = []
    deps.forEach(dep => {
      subTasks.push({
        title: `Check dependency: ${dep}`,
        task: () => this.checkDependency(dep)
      })
    })

    return subTasks
  }
}
