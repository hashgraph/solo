/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ConfigManager} from './config_manager.js';
import {type CommandFlag} from '../types/flag_types.js';

/**
 * Dynamically builds a class with properties from the provided list of flags
 * and extra properties, will keep track of which properties are used.  Call
 * getUnusedConfigs() to get an array of unused properties.
 */
export function getConfig(
  configManager: ConfigManager,
  configMaps: ConfigMap,
  configName: string,
  flags: CommandFlag[],
  extraProperties: string[] = [],
): object {
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
  configMaps.set(configName, newConfigInstance);

  return newConfigInstance;
}

export type ConfigMap = Map<string, any>;
