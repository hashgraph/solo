// SPDX-License-Identifier: Apache-2.0

import os from 'os';
import {SoloError} from '../errors.js';
import {ShellRunner} from '../shell_runner.js';
import {HelmDependencyManager} from './helm_dependency_manager.js';
import {container, inject, injectable} from 'tsyringe-neo';
import * as constants from '../constants.js';
import {InjectTokens} from '../dependency_injection/inject_tokens.js';
import {type SoloListrTask} from '../../types/index.js';

@injectable()
export class DependencyManager extends ShellRunner {
  private readonly depManagerMap: Map<string, HelmDependencyManager>;

  constructor(@inject(InjectTokens.HelmDependencyManager) helmDepManager?: HelmDependencyManager) {
    super();
    if (helmDepManager) {
      this.depManagerMap = new Map().set(constants.HELM, helmDepManager);
    } else {
      this.depManagerMap = new Map().set(constants.HELM, container.resolve(HelmDependencyManager));
    }
  }

  /**
   * Check if the required dependency is installed or not
   * @param dep - is the name of the program
   * @param [shouldInstall] - Whether or not install the dependency if not installed
   */
  async checkDependency(dep: string, shouldInstall = true) {
    this.logger.debug(`Checking for dependency: ${dep}`);

    let status = false;
    const manager = this.depManagerMap.get(dep);
    if (manager) {
      // @ts-ignore
      status = await manager.checkVersion(shouldInstall);
    }

    if (!status) {
      throw new SoloError(`Dependency '${dep}' is not found`);
    }

    this.logger.debug(`Dependency '${dep}' is found`);
    return true;
  }

  taskCheckDependencies<T>(deps: string[]) {
    return deps.map(dep => {
      return {
        title: `Check dependency: ${dep} [OS: ${os.platform()}, Release: ${os.release()}, Arch: ${os.arch()}]`,
        task: () => this.checkDependency(dep),
      } as SoloListrTask<T>;
    });
  }
}
