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

import {MissingArgumentError, SoloError} from '../core/errors.js';
import {ShellRunner} from '../core/shell_runner.js';
import {type LeaseManager} from '../core/lease/lease_manager.js';
import {type LocalConfig} from '../core/config/local_config.js';
import {type RemoteConfigManager} from '../core/config/remote/remote_config_manager.js';
import {type Helm} from '../core/helm.js';
import {type K8} from '../core/k8.js';
import {type ChartManager} from '../core/chart_manager.js';
import {type ConfigManager} from '../core/config_manager.js';
import {type DependencyManager} from '../core/dependency_managers/index.js';
import {type Opts} from '../types/command_types.js';
import {type CommandFlag} from '../types/flag_types.js';
import {type Lease} from '../core/lease/lease.js';
import {Listr} from 'listr2';
import path from 'path';
import * as constants from '../core/constants.js';
import fs from 'fs';
import {Task} from '../core/task.js';
import {getConfig} from '../core/config_builder.js';

export abstract class BaseCommand extends ShellRunner {
  protected readonly helm: Helm;
  protected readonly k8: K8;
  protected readonly chartManager: ChartManager;
  protected readonly configManager: ConfigManager;
  protected readonly depManager: DependencyManager;
  protected readonly leaseManager: LeaseManager;
  protected readonly _configMaps = new Map<string, any>();
  public readonly localConfig: LocalConfig;
  protected readonly remoteConfigManager: RemoteConfigManager;

  constructor(opts: Opts) {
    if (!opts || !opts.helm) throw new Error('An instance of core/Helm is required');
    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required');
    if (!opts || !opts.chartManager) throw new Error('An instance of core/ChartManager is required');
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required');
    if (!opts || !opts.depManager) throw new Error('An instance of core/DependencyManager is required');
    if (!opts || !opts.localConfig) throw new Error('An instance of core/LocalConfig is required');
    if (!opts || !opts.remoteConfigManager)
      throw new Error('An instance of core/config/RemoteConfigManager is required');
    super();

    this.helm = opts.helm;
    this.k8 = opts.k8;
    this.chartManager = opts.chartManager;
    this.configManager = opts.configManager;
    this.depManager = opts.depManager;
    this.leaseManager = opts.leaseManager;
    this.localConfig = opts.localConfig;
    this.remoteConfigManager = opts.remoteConfigManager;
  }

  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  getChartManager(): ChartManager {
    return this.chartManager;
  }

  /**
   * Dynamically builds a class with properties from the provided list of flags
   * and extra properties, will keep track of which properties are used.  Call
   * getUnusedConfigs() to get an array of unused properties.
   */
  getConfig(configName: string, flags: CommandFlag[], extraProperties: string[] = []): object {
    return getConfig(this.configManager, this._configMaps, configName, flags, extraProperties);
  }

  getLeaseManager(): LeaseManager {
    return this.leaseManager;
  }

  /**
   * Get the list of unused configurations that were not accessed
   * @returns an array of unused configurations
   */
  getUnusedConfigs(configName: string): string[] {
    return this._configMaps.get(configName).getUnusedConfigs();
  }

  getK8() {
    return this.k8;
  }

  getLocalConfig() {
    return this.localConfig;
  }

  getRemoteConfigManager() {
    return this.remoteConfigManager;
  }

  abstract close(): Promise<void>;

  /**
   * Setup home directories
   * @param dirs a list of directories that need to be created in sequence
   */
  setupHomeDirectory(
    dirs: string[] = [
      constants.SOLO_HOME_DIR,
      constants.SOLO_LOGS_DIR,
      constants.SOLO_CACHE_DIR,
      constants.SOLO_VALUES_DIR,
    ],
  ) {
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

  setupHomeDirectoryTask() {
    return new Task('Setup home directory', async () => {
      this.setupHomeDirectory();
    });
  }
}
