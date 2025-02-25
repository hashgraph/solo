/**
 * SPDX-License-Identifier: Apache-2.0
 */

import {SoloError} from '../core/errors.js';
import {ShellRunner} from '../core/shell_runner.js';
import {type LeaseManager} from '../core/lease/lease_manager.js';
import {type LocalConfig} from '../core/config/local_config.js';
import {type RemoteConfigManager} from '../core/config/remote/remote_config_manager.js';
import {type Helm} from '../core/helm.js';
import {type K8Factory} from '../core/kube/k8_factory.js';
import {type ChartManager} from '../core/chart_manager.js';
import {type ConfigManager} from '../core/config_manager.js';
import {type DependencyManager} from '../core/dependency_managers/index.js';
import {type CommandFlag} from '../types/flag_types.js';
import path from 'path';
import * as constants from '../core/constants.js';
import fs from 'fs';
import {Task} from '../core/task.js';
import {type ClusterRef, type ClusterRefs} from '../core/config/remote/types.js';
import {Flags} from './flags.js';
import {type SoloLogger} from '../core/logging.js';
import {type PackageDownloader} from '../core/package_downloader.js';
import {type PlatformInstaller} from '../core/platform_installer.js';
import {type KeyManager} from '../core/key_manager.js';
import {type AccountManager} from '../core/account_manager.js';
import {type ProfileManager} from '../core/profile_manager.js';
import {type CertificateManager} from '../core/certificate_manager.js';
import {getConfig} from '../core/config_builder.js';

export interface Opts {
  logger: SoloLogger;
  helm: Helm;
  k8Factory: K8Factory;
  downloader: PackageDownloader;
  platformInstaller: PlatformInstaller;
  chartManager: ChartManager;
  configManager: ConfigManager;
  depManager: DependencyManager;
  keyManager: KeyManager;
  accountManager: AccountManager;
  profileManager: ProfileManager;
  leaseManager: LeaseManager;
  certificateManager: CertificateManager;
  localConfig: LocalConfig;
  remoteConfigManager: RemoteConfigManager;
}

export abstract class BaseCommand extends ShellRunner {
  protected readonly helm: Helm;
  protected readonly k8Factory: K8Factory;
  protected readonly chartManager: ChartManager;
  protected readonly configManager: ConfigManager;
  protected readonly depManager: DependencyManager;
  protected readonly leaseManager: LeaseManager;
  protected readonly _configMaps = new Map<string, any>();
  public readonly localConfig: LocalConfig;
  protected readonly remoteConfigManager: RemoteConfigManager;

  constructor(opts: Opts) {
    if (!opts || !opts.helm) throw new Error('An instance of core/Helm is required');
    if (!opts || !opts.k8Factory) throw new Error('An instance of core/K8Factory is required');
    if (!opts || !opts.chartManager) throw new Error('An instance of core/ChartManager is required');
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required');
    if (!opts || !opts.depManager) throw new Error('An instance of core/DependencyManager is required');
    if (!opts || !opts.localConfig) throw new Error('An instance of core/LocalConfig is required');
    if (!opts || !opts.remoteConfigManager)
      throw new Error('An instance of core/config/RemoteConfigManager is required');
    super();

    this.helm = opts.helm;
    this.k8Factory = opts.k8Factory;
    this.chartManager = opts.chartManager;
    this.configManager = opts.configManager;
    this.depManager = opts.depManager;
    this.leaseManager = opts.leaseManager;
    this.localConfig = opts.localConfig;
    this.remoteConfigManager = opts.remoteConfigManager;
  }

  /**
   * Prepare the values files map for each cluster
   *
   * <p> Order of precedence:
   * <ol>
   *   <li> Chart's default values file (if chartDirectory is set) </li>
   *   <li> Profile values file </li>
   *   <li> User's values file </li>
   * </ol>
   * @param clusterRefs - the map of cluster references
   * @param valuesFileInput - the values file input string
   * @param chartDirectory - the chart directory
   * @param profileValuesFile - the profile values file
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
      const chartValuesFile = path.join(chartDirectory, 'solo-deployment', 'values.yaml');
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

  /**
   * Dynamically builds a class with properties from the provided list of flags
   * and extra properties, will keep track of which properties are used.  Call
   * getUnusedConfigs() to get an array of unused properties.
   */
  public getConfig(configName: string, flags: CommandFlag[], extraProperties: string[] = []): object {
    return getConfig(this.configManager, this._configMaps, configName, flags, extraProperties);
  }

  public getLeaseManager(): LeaseManager {
    return this.leaseManager;
  }

  /**
   * Get the list of unused configurations that were not accessed
   * @returns an array of unused configurations
   */
  public getUnusedConfigs(configName: string): string[] {
    return this._configMaps.get(configName).getUnusedConfigs();
  }

  public getK8Factory() {
    return this.k8Factory;
  }

  public getLocalConfig() {
    return this.localConfig;
  }

  public getRemoteConfigManager() {
    return this.remoteConfigManager;
  }

  abstract close(): Promise<void>;

  /**
   * Setup home directories
   * @param dirs a list of directories that need to be created in sequence
   */
  public setupHomeDirectory(
    dirs: string[] = [
      constants.SOLO_HOME_DIR,
      constants.SOLO_LOGS_DIR,
      constants.SOLO_CACHE_DIR,
      constants.SOLO_VALUES_DIR,
    ],
  ): string[] {
    const self = this;

    try {
      dirs.forEach(dirPath => {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, {recursive: true});
        }
        self.logger.debug(`OK: setup directory: ${dirPath}`);
      });
    } catch (e: Error | any) {
      self.logger.error(e);
      throw new SoloError(`failed to create directory: ${e.message}`, e);
    }

    return dirs;
  }

  public setupHomeDirectoryTask(): Task {
    return new Task('Setup home directory', async () => {
      this.setupHomeDirectory();
    });
  }
}
