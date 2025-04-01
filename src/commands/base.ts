// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../core/errors/solo-error.js';
import {ShellRunner} from '../core/shell-runner.js';
import {type LockManager} from '../core/lock/lock-manager.js';
import {type LocalConfig} from '../core/config/local/local-config.js';
import {type RemoteConfigManager} from '../core/config/remote/remote-config-manager.js';
import {type ChartManager} from '../core/chart-manager.js';
import {type ConfigManager} from '../core/config-manager.js';
import {type DependencyManager} from '../core/dependency-managers/index.js';
import * as constants from '../core/constants.js';
import fs from 'node:fs';
import {type ClusterReference, type ClusterReferences} from '../core/config/remote/types.js';
import {Flags} from './flags.js';
import {type SoloLogger} from '../core/logging/solo-logger.js';
import {type PackageDownloader} from '../core/package-downloader.js';
import {type PlatformInstaller} from '../core/platform-installer.js';
import {type KeyManager} from '../core/key-manager.js';
import {type AccountManager} from '../core/account-manager.js';
import {type ProfileManager} from '../core/profile-manager.js';
import {type CertificateManager} from '../core/certificate-manager.js';
import {PathEx} from '../business/utils/path-ex.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type HelmClient} from '../integration/helm/helm-client.js';

export interface Options {
  logger: SoloLogger;
  helm: HelmClient;
  k8Factory: K8Factory;
  downloader: PackageDownloader;
  platformInstaller: PlatformInstaller;
  chartManager: ChartManager;
  configManager: ConfigManager;
  depManager: DependencyManager;
  keyManager: KeyManager;
  accountManager: AccountManager;
  profileManager: ProfileManager;
  leaseManager: LockManager;
  certificateManager: CertificateManager;
  localConfig: LocalConfig;
  remoteConfigManager: RemoteConfigManager;
}

export abstract class BaseCommand extends ShellRunner {
  protected readonly helm: HelmClient;
  protected readonly k8Factory: K8Factory;
  protected readonly chartManager: ChartManager;
  public readonly configManager: ConfigManager;
  protected readonly depManager: DependencyManager;
  protected readonly leaseManager: LockManager;
  public readonly localConfig: LocalConfig;
  protected readonly remoteConfigManager: RemoteConfigManager;

  constructor(options: Options) {
    if (!options || !options.helm) throw new Error('An instance of core/Helm is required');
    if (!options || !options.k8Factory) throw new Error('An instance of core/K8Factory is required');
    if (!options || !options.chartManager) throw new Error('An instance of core/ChartManager is required');
    if (!options || !options.configManager) throw new Error('An instance of core/ConfigManager is required');
    if (!options || !options.depManager) throw new Error('An instance of core/DependencyManager is required');
    if (!options || !options.localConfig) throw new Error('An instance of core/LocalConfig is required');
    if (!options || !options.remoteConfigManager)
      throw new Error('An instance of core/config/RemoteConfigManager is required');
    super();

    this.helm = options.helm;
    this.k8Factory = options.k8Factory;
    this.chartManager = options.chartManager;
    this.configManager = options.configManager;
    this.depManager = options.depManager;
    this.leaseManager = options.leaseManager;
    this.localConfig = options.localConfig;
    this.remoteConfigManager = options.remoteConfigManager;
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
    clusterReferences: ClusterReferences,
    chartDirectory?: string,
    profileValuesFile?: Record<ClusterReference, string>,
    valuesFileInput?: string,
  ): Record<ClusterReference, string> {
    // initialize the map with an empty array for each cluster-ref
    const valuesFiles: Record<ClusterReference, string> = {[Flags.KEY_COMMON]: ''};
    Object.keys(clusterReferences).forEach(clusterReference => (valuesFiles[clusterReference] = ''));

    // add the chart's default values file for each cluster-ref if chartDirectory is set
    // this should be the first in the list of values files as it will be overridden by user's input
    if (chartDirectory) {
      const chartValuesFile = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
      for (const clusterReference in valuesFiles) {
        valuesFiles[clusterReference] += ` --values ${chartValuesFile}`;
      }
    }

    if (profileValuesFile) {
      Object.entries(profileValuesFile).forEach(([clusterReference, file]) => {
        const valuesArgument = ` --values ${file}`;

        if (clusterReference === Flags.KEY_COMMON) {
          Object.keys(valuesFiles).forEach(clusterReference_ => (valuesFiles[clusterReference_] += valuesArgument));
        } else {
          valuesFiles[clusterReference] += valuesArgument;
        }
      });
    }

    if (valuesFileInput) {
      const parsed = Flags.parseValuesFilesInput(valuesFileInput);
      Object.entries(parsed).forEach(([clusterReference, files]) => {
        let vf = '';
        files.forEach(file => {
          vf += ` --values ${file}`;
        });

        if (clusterReference === Flags.KEY_COMMON) {
          Object.entries(valuesFiles).forEach(([clusterReference_]) => {
            valuesFiles[clusterReference_] += vf;
          });
        } else {
          valuesFiles[clusterReference] += vf;
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
    clusterReferences: ClusterReferences,
    chartDirectory?: string,
    profileValuesFile?: string,
    valuesFileInput?: string,
  ): Record<ClusterReference, string> {
    // initialize the map with an empty array for each cluster-ref
    const valuesFiles: Record<ClusterReference, string> = {
      [Flags.KEY_COMMON]: '',
    };
    Object.keys(clusterReferences).forEach(clusterReference => {
      valuesFiles[clusterReference] = '';
    });

    // add the chart's default values file for each cluster-ref if chartDirectory is set
    // this should be the first in the list of values files as it will be overridden by user's input
    if (chartDirectory) {
      const chartValuesFile = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
      for (const clusterReference in valuesFiles) {
        valuesFiles[clusterReference] += ` --values ${chartValuesFile}`;
      }
    }

    if (profileValuesFile) {
      const parsed = Flags.parseValuesFilesInput(profileValuesFile);
      Object.entries(parsed).forEach(([clusterReference, files]) => {
        let vf = '';
        files.forEach(file => {
          vf += ` --values ${file}`;
        });

        if (clusterReference === Flags.KEY_COMMON) {
          Object.entries(valuesFiles).forEach(([cf]) => {
            valuesFiles[cf] += vf;
          });
        } else {
          valuesFiles[clusterReference] += vf;
        }
      });
    }

    if (valuesFileInput) {
      const parsed = Flags.parseValuesFilesInput(valuesFileInput);
      Object.entries(parsed).forEach(([clusterReference, files]) => {
        let vf = '';
        files.forEach(file => {
          vf += ` --values ${file}`;
        });

        if (clusterReference === Flags.KEY_COMMON) {
          Object.entries(valuesFiles).forEach(([clusterReference_]) => {
            valuesFiles[clusterReference_] += vf;
          });
        } else {
          valuesFiles[clusterReference] += vf;
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
  public setupHomeDirectory(directories: string[] = []) {
    if (!directories || directories?.length === 0) {
      directories = [
        constants.SOLO_HOME_DIR,
        constants.SOLO_LOGS_DIR,
        this.configManager.getFlag<string>(Flags.cacheDir) || constants.SOLO_CACHE_DIR,
        constants.SOLO_VALUES_DIR,
      ];
    }
    const self = this;

    try {
      directories.forEach(directoryPath => {
        if (!fs.existsSync(directoryPath)) {
          fs.mkdirSync(directoryPath, {recursive: true});
        }
        self.logger.debug(`OK: setup directory: ${directoryPath}`);
      });
    } catch (error) {
      throw new SoloError(`failed to create directory: ${error.message}`, error);
    }

    return directories;
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
