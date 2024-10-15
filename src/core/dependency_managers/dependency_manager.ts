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
import os from 'os'
import { SoloError, MissingArgumentError } from '../errors.ts'
import { ShellRunner } from '../shell_runner.ts'
import { type SoloLogger} from "../logging.ts"
import { type HelmDependencyManager } from "./helm_dependency_manager.ts"

export class DependencyManager extends ShellRunner {
  constructor (logger: SoloLogger,
    private readonly depManagerMap: Map<string, DependencyManager | HelmDependencyManager>) {
    if (!logger) throw new MissingArgumentError('an instance of core/SoloLogger is required', logger)
    super(logger)
    if (!depManagerMap) throw new MissingArgumentError('A map of dependency managers are required')
  }

  /**
   * Check if the required dependency is installed or not
   * @param dep - is the name of the program
   * @param [shouldInstall] - Whether or not install the dependency if not installed
   */
  async checkDependency (dep: string, shouldInstall: boolean = true) {
    this.logger.debug(`Checking for dependency: ${dep}`)

    let status = false
    const manager = this.depManagerMap.get(dep)
    if (manager) {
      // @ts-ignore
      status = await manager.checkVersion(shouldInstall)
    }

    if (!status) {
      throw new SoloError(`Dependency '${dep}' is not found`)
    }

    this.logger.debug(`Dependency '${dep}' is found`)
    return true
  }

  taskCheckDependencies (deps: string[]) {
    const subTasks: any[] = []
    deps.forEach(dep => {
      subTasks.push({
        title: `Check dependency: ${dep} [OS: ${os.platform()}, Release: ${os.release()}, Arch: ${os.arch()}]`,
        task: () => this.checkDependency(dep)
      })
    })

    return subTasks
  }
}
