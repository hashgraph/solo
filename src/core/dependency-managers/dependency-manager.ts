// SPDX-License-Identifier: Apache-2.0

import os from 'node:os';
import {SoloErrors} from '../errors/solo-errors.js';
import {ShellRunner} from '../shell-runner.js';
import {HelmDependencyManager} from './helm-dependency-manager.js';
import {container, inject, injectable} from 'tsyringe-neo';
import * as constants from '../constants.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../types/index.js';
import {KindDependencyManager} from './kind-dependency-manager.js';
import {KubectlDependencyManager} from './kubectl-dependency-manager.js';
import {PodmanDependencyManager} from './podman-dependency-manager.js';
import {VfkitDependencyManager} from './vfkit-dependency-manager.js';
import {GvproxyDependencyManager} from './gvproxy-dependency-manager.js';
import {NetavarkDependencyManager} from './netavark-dependency-manager.js';
import {AardvarkDnsDependencyManager} from './aardvark-dns-dependency-manager.js';

export type DependencyManagerType =
  | HelmDependencyManager
  | KindDependencyManager
  | KubectlDependencyManager
  | PodmanDependencyManager
  | VfkitDependencyManager
  | GvproxyDependencyManager
  | NetavarkDependencyManager
  | AardvarkDnsDependencyManager;

@injectable()
export class DependencyManager extends ShellRunner {
  private readonly dependancyManagerMap: Map<string, DependencyManagerType>;

  public constructor(
    @inject(InjectTokens.HelmDependencyManager) helmDepManager?: HelmDependencyManager,
    @inject(InjectTokens.KindDependencyManager) kindDepManager?: KindDependencyManager,
    @inject(InjectTokens.KubectlDependencyManager) kubectlDependencyManager?: KubectlDependencyManager,
    @inject(InjectTokens.PodmanDependencyManager) podmanDependencyManager?: PodmanDependencyManager,
    @inject(InjectTokens.VfkitDependencyManager) vfkitDependencyManager?: VfkitDependencyManager,
    @inject(InjectTokens.GvproxyDependencyManager) gvproxyDependencyManager?: GvproxyDependencyManager,
    @inject(InjectTokens.NetavarkDependencyManager) netavarkDependencyManager?: NetavarkDependencyManager,
    @inject(InjectTokens.AardvarkDnsDependencyManager) aardvarkDnsDependencyManager?: AardvarkDnsDependencyManager,
  ) {
    super();
    this.dependancyManagerMap = new Map();

    this.dependancyManagerMap.set(
      constants.HELM,
      helmDepManager || container.resolve(InjectTokens.HelmDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.KIND,
      kindDepManager || container.resolve(InjectTokens.KindDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.KUBECTL,
      kubectlDependencyManager || container.resolve(InjectTokens.KubectlDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.PODMAN,
      podmanDependencyManager || container.resolve(InjectTokens.PodmanDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.VFKIT,
      vfkitDependencyManager || container.resolve(InjectTokens.VfkitDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.GVPROXY,
      gvproxyDependencyManager || container.resolve(InjectTokens.GvproxyDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.NETAVARK,
      netavarkDependencyManager || container.resolve(InjectTokens.NetavarkDependencyManager),
    );

    this.dependancyManagerMap.set(
      constants.AARDVARK_DNS,
      aardvarkDnsDependencyManager || container.resolve(InjectTokens.AardvarkDnsDependencyManager),
    );
  }

  public async getDependency(dependency: string): Promise<DependencyManagerType> {
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dependency);
    if (manager) {
      return manager;
    }
    throw new SoloErrors.system.dependencyManagerNotFound(dependency);
  }

  /**
   * Check if the required dependency is installed or not
   * @param dependency - is the name of the program
   */
  public async checkDependency(dependency: string): Promise<boolean> {
    this.logger.debug(`Checking for dependency: ${dependency}`);

    let status: boolean = false;
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dependency);
    if (manager) {
      status = await manager.install();
    }

    if (!status) {
      throw new SoloErrors.system.dependencyNotFound(dependency);
    }

    this.logger.debug(`Dependency '${dependency}' is found`);
    return true;
  }

  public async skipDependency(dependency: string): Promise<boolean> {
    let skip: boolean = false;
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dependency);

    if (manager) {
      skip = !(await manager.shouldInstall());
    }

    this.logger.debug(`Skipping install of for dependency: ${dependency}: ${skip}`);
    return skip;
  }

  public taskCheckDependencies<T>(dependencies: string[]): SoloListrTask<T>[] {
    return dependencies.map(
      (
        dependency,
      ): {
        title: string;
        task: (_context: T, task: SoloListrTaskWrapper<T>) => Promise<boolean>;
        skip: () => Promise<boolean>;
      } => {
        return {
          title: `Check dependency: ${dependency} [OS: ${os.platform()}, Release: ${os.release()}, Arch: ${os.arch()}]`,
          task: async (_context: T, task: SoloListrTaskWrapper<T>): Promise<boolean> => {
            const result: boolean = await this.checkDependency(dependency);
            try {
              const manager: DependencyManagerType = await this.getDependency(dependency);
              const executablePath: string = await manager.getExecutable();
              const version: string = await manager.getVersion(executablePath);
              task.title = `Check dependency: ${dependency} v${version} (${executablePath}) [OS: ${os.platform()}, Release: ${os.release()}, Arch: ${os.arch()}]`;
            } catch {
              // best-effort: version display is informational only; ignore failures
            }
            return result;
          },
          skip: (): Promise<boolean> => this.skipDependency(dependency),
        };
      },
    );
  }

  public async getExecutable(dependency: string): Promise<string> {
    const manager: DependencyManagerType = this.dependancyManagerMap.get(dependency);
    if (manager) {
      return await manager.getExecutable();
    }
    throw new SoloErrors.system.dependencyManagerNotFound(dependency);
  }
}
