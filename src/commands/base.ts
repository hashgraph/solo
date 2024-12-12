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

import paths from 'path';
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

export interface CommandHandlers {
  parent: BaseCommand;
}

export abstract class BaseCommand extends ShellRunner {
  protected readonly helm: Helm;
  protected readonly k8: K8;
  protected readonly chartManager: ChartManager;
  protected readonly configManager: ConfigManager;
  protected readonly depManager: DependencyManager;
  protected readonly leaseManager: LeaseManager;
  protected readonly _configMaps = new Map<string, any>();
  protected readonly localConfig: LocalConfig;
  protected readonly remoteConfigManager: RemoteConfigManager;

  constructor(opts: Opts) {
    if (!opts || !opts.logger) throw new Error('An instance of core/SoloLogger is required');
    if (!opts || !opts.helm) throw new Error('An instance of core/Helm is required');
    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required');
    if (!opts || !opts.chartManager) throw new Error('An instance of core/ChartManager is required');
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required');
    if (!opts || !opts.depManager) throw new Error('An instance of core/DependencyManager is required');
    if (!opts || !opts.localConfig) throw new Error('An instance of core/LocalConfig is required');
    if (!opts || !opts.remoteConfigManager)
      throw new Error('An instance of core/config/RemoteConfigManager is required');

    super(opts.logger);

    this.helm = opts.helm;
    this.k8 = opts.k8;
    this.chartManager = opts.chartManager;
    this.configManager = opts.configManager;
    this.depManager = opts.depManager;
    this.leaseManager = opts.leaseManager;
    this.localConfig = opts.localConfig;
    this.remoteConfigManager = opts.remoteConfigManager;
  }

  async prepareChartPath(chartDir: string, chartRepo: string, chartReleaseName: string) {
    if (!chartRepo) throw new MissingArgumentError('chart repo name is required');
    if (!chartReleaseName) throw new MissingArgumentError('chart release name is required');

    if (chartDir) {
      const chartPath = path.join(chartDir, chartReleaseName);
      await this.helm.dependency('update', chartPath);
      return chartPath;
    }

    return `${chartRepo}/${chartReleaseName}`;
  }

  prepareValuesFiles(valuesFile: string) {
    let valuesArg = '';
    if (valuesFile) {
      const valuesFiles = valuesFile.split(',');
      valuesFiles.forEach(vf => {
        const vfp = paths.resolve(vf);
        valuesArg += ` --values ${vfp}`;
      });
    }

    return valuesArg;
  }

  /**
   * Dynamically builds a class with properties from the provided list of flags
   * and extra properties, will keep track of which properties are used.  Call
   * getUnusedConfigs() to get an array of unused properties.
   */
  getConfig(configName: string, flags: CommandFlag[], extraProperties: string[] = []): object {
    const configManager = this.configManager;

    // build the dynamic class that will keep track of which properties are used
    const NewConfigClass = class {
      private usedConfigs: Map<string, number>;
      constructor() {
        // the map to keep track of which properties are used
        this.usedConfigs = new Map();

        // add the flags as properties to this class
        flags?.forEach(flag => {
          // @ts-ignore
          this[`_${flag.constName}`] = configManager.getFlag(flag);
          Object.defineProperty(this, flag.constName, {
            get() {
              this.usedConfigs.set(flag.constName, this.usedConfigs.get(flag.constName) + 1 || 1);
              return this[`_${flag.constName}`];
            },
          });
        });

        // add the extra properties as properties to this class
        extraProperties?.forEach(name => {
          // @ts-ignore
          this[`_${name}`] = '';
          Object.defineProperty(this, name, {
            get() {
              this.usedConfigs.set(name, this.usedConfigs.get(name) + 1 || 1);
              return this[`_${name}`];
            },
            set(value) {
              this[`_${name}`] = value;
            },
          });
        });
      }

      /** Get the list of unused configurations that were not accessed */
      getUnusedConfigs() {
        const unusedConfigs: string[] = [];

        // add the flag constName to the unusedConfigs array if it was not accessed
        flags?.forEach(flag => {
          if (!this.usedConfigs.has(flag.constName)) {
            unusedConfigs.push(flag.constName);
          }
        });

        // add the extra properties to the unusedConfigs array if it was not accessed
        extraProperties?.forEach(item => {
          if (!this.usedConfigs.has(item)) {
            unusedConfigs.push(item);
          }
        });
        return unusedConfigs;
      }
    };

    const newConfigInstance = new NewConfigClass();

    // add the new instance to the configMaps so that it can be used to get the
    // unused configurations using the configName from the BaseCommand
    this._configMaps.set(configName, newConfigInstance);

    return newConfigInstance;
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

  abstract close(): Promise<void>;

  commandActionBuilder(actionTasks: any, options: any, errorString: string, lease: Lease | null) {
    return async function (argv: any, commandDef: CommandHandlers) {
      const tasks = new Listr([...actionTasks], options);

      try {
        await tasks.run();
      } catch (e: Error | any) {
        commandDef.parent.logger.error(`${errorString}: ${e.message}`, e);
        throw new SoloError(`${errorString}: ${e.message}`, e);
      } finally {
        const promises = [];

        promises.push(commandDef.parent.close());

        if (lease) promises.push(lease.release());
        await Promise.all(promises);
      }
    };
  }
}
