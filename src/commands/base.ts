// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../core/errors/solo-error.js';
import {ShellRunner} from '../core/shell-runner.js';
import {type LockManager} from '../core/lock/lock-manager.js';
import {type LocalConfig} from '../core/config/local/local-config.js';
import {type RemoteConfigManager} from '../core/config/remote/remote-config-manager.js';
import {type Helm} from '../core/helm.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type ChartManager} from '../core/chart-manager.js';
import {type ConfigManager} from '../core/config-manager.js';
import {type DependencyManager} from '../core/dependency-managers/index.js';
import * as constants from '../core/constants.js';
import fs from 'fs';
import {type ClusterRef, type ClusterRefs} from '../core/config/remote/types.js';
import {Flags} from './flags.js';
import {PathEx} from '../business/utils/path-ex.js';
import {inject} from 'tsyringe-neo';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';

export abstract class BaseCommand extends ShellRunner {
  constructor(
    @inject(InjectTokens.Helm) protected readonly helm?: Helm,
    @inject(InjectTokens.K8Factory) protected readonly k8Factory?: K8Factory,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
    @inject(InjectTokens.ConfigManager) public readonly configManager?: ConfigManager,
    @inject(InjectTokens.DependencyManager) protected readonly depManager?: DependencyManager,
    @inject(InjectTokens.LockManager) protected readonly leaseManager?: LockManager,
    @inject(InjectTokens.LocalConfig) public readonly localConfig?: LocalConfig,
    @inject(InjectTokens.RemoteConfigManager) protected readonly remoteConfigManager?: RemoteConfigManager,
  ) {
    super();

    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.depManager = patchInject(depManager, InjectTokens.DependencyManager, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.remoteConfigManager = patchInject(
      remoteConfigManager,
      InjectTokens.RemoteConfigManager,
      this.constructor.name,
    );
  }

  /**
   * Prepare the values files map for each cluster
   *
   * Order of precedence:
   * 1. Chart's default values file (if chartDirectory is set)
   * 2. Profile values file
   * 3. User's values file
   * @param clusterRefs
   * @param valuesFileInput - the values file input string
   * @param chartDirectory - the chart directory
   * @param profileValuesFile - mapping of clusterRef to the profile values file full path
   */
  static prepareValuesFilesMapMulticluster(
    clusterRefs: ClusterRefs,
    chartDirectory?: string,
    profileValuesFile?: Record<ClusterRef, string>,
    valuesFileInput?: string,
  ): Record<ClusterRef, string> {
    // initialize the map with an empty array for each cluster-ref
    const valuesFiles: Record<ClusterRef, string> = {[Flags.KEY_COMMON]: ''};
    Object.keys(clusterRefs).forEach(clusterRef => (valuesFiles[clusterRef] = ''));

    // add the chart's default values file for each cluster-ref if chartDirectory is set
    // this should be the first in the list of values files as it will be overridden by user's input
    if (chartDirectory) {
      const chartValuesFile = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
      for (const clusterRef in valuesFiles) {
        valuesFiles[clusterRef] += ` --values ${chartValuesFile}`;
      }
    }

    if (profileValuesFile) {
      Object.entries(profileValuesFile).forEach(([clusterRef, file]) => {
        const valuesArg = ` --values ${file}`;

        if (clusterRef === Flags.KEY_COMMON) {
          Object.keys(valuesFiles).forEach(clusterRef => (valuesFiles[clusterRef] += valuesArg));
        } else {
          valuesFiles[clusterRef] += valuesArg;
        }
      });
    }

    if (valuesFileInput) {
      const parsed = Flags.parseValuesFilesInput(valuesFileInput);
      Object.entries(parsed).forEach(([clusterRef, files]) => {
        let vf = '';
        files.forEach(file => {
          vf += ` --values ${file}`;
        });

        if (clusterRef === Flags.KEY_COMMON) {
          Object.entries(valuesFiles).forEach(([clusterRef]) => {
            valuesFiles[clusterRef] += vf;
          });
        } else {
          valuesFiles[clusterRef] += vf;
        }
      });
    }

    if (Object.keys(valuesFiles).length > 1) {
      // delete the common key if there is another cluster to use
      delete valuesFiles[Flags.KEY_COMMON];
    }

    return valuesFiles;
  }

  /**
   * Prepare the values files map for each cluster
   *
   * Order of precedence:
   * 1. Chart's default values file (if chartDirectory is set)
   * 2. Profile values file
   * 3. User's values file
   * @param clusterRefs
   * @param valuesFileInput - the values file input string
   * @param chartDirectory - the chart directory
   * @param profileValuesFile - the profile values file full path
   */
  static prepareValuesFilesMap(
    clusterRefs: ClusterRefs,
    chartDirectory?: string,
    profileValuesFile?: string,
    valuesFileInput?: string,
  ): Record<ClusterRef, string> {
    // initialize the map with an empty array for each cluster-ref
    const valuesFiles: Record<ClusterRef, string> = {
      [Flags.KEY_COMMON]: '',
    };
    Object.keys(clusterRefs).forEach(clusterRef => {
      valuesFiles[clusterRef] = '';
    });

    // add the chart's default values file for each cluster-ref if chartDirectory is set
    // this should be the first in the list of values files as it will be overridden by user's input
    if (chartDirectory) {
      const chartValuesFile = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
      for (const clusterRef in valuesFiles) {
        valuesFiles[clusterRef] += ` --values ${chartValuesFile}`;
      }
    }

    if (profileValuesFile) {
      const parsed = Flags.parseValuesFilesInput(profileValuesFile);
      Object.entries(parsed).forEach(([clusterRef, files]) => {
        let vf = '';
        files.forEach(file => {
          vf += ` --values ${file}`;
        });

        if (clusterRef === Flags.KEY_COMMON) {
          Object.entries(valuesFiles).forEach(([cf]) => {
            valuesFiles[cf] += vf;
          });
        } else {
          valuesFiles[clusterRef] += vf;
        }
      });
    }

    if (valuesFileInput) {
      const parsed = Flags.parseValuesFilesInput(valuesFileInput);
      Object.entries(parsed).forEach(([clusterRef, files]) => {
        let vf = '';
        files.forEach(file => {
          vf += ` --values ${file}`;
        });

        if (clusterRef === Flags.KEY_COMMON) {
          Object.entries(valuesFiles).forEach(([clusterRef]) => {
            valuesFiles[clusterRef] += vf;
          });
        } else {
          valuesFiles[clusterRef] += vf;
        }
      });
    }

    if (Object.keys(valuesFiles).length > 1) {
      // delete the common key if there is another cluster to use
      delete valuesFiles[Flags.KEY_COMMON];
    }

    return valuesFiles;
  }

  abstract close(): Promise<void>;

  /**
   * Setup home directories
   * @param dirs a list of directories that need to be created in sequence
   */
  public setupHomeDirectory(dirs: string[] = []) {
    if (!dirs || dirs?.length === 0) {
      dirs = [
        constants.SOLO_HOME_DIR,
        constants.SOLO_LOGS_DIR,
        this.configManager.getFlag<string>(Flags.cacheDir) || constants.SOLO_CACHE_DIR,
        constants.SOLO_VALUES_DIR,
      ];
    }
    const self = this;

    try {
      dirs.forEach(dirPath => {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, {recursive: true});
        }
        self.logger.debug(`OK: setup directory: ${dirPath}`);
      });
    } catch (e) {
      throw new SoloError(`failed to create directory: ${e.message}`, e);
    }

    return dirs;
  }

  public setupHomeDirectoryTask() {
    return {
      tile: 'Setup home directory',
      task: async () => {
        this.setupHomeDirectory();
      },
    };
  }
}
