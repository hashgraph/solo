// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {SoloError, MissingArgumentError} from './errors.js';
import {type SoloLogger} from './logging.js';
import {Flags, Flags as flags} from '../commands/flags.js';
import * as paths from 'path';
import * as helpers from './helpers.js';
import type * as yargs from 'yargs';
import {type CommandFlag} from '../types/flag_types.js';
import {patchInject} from './dependency_injection/container_helper.js';
import * as constants from '../core/constants.js';
import {NamespaceName} from './kube/resources/namespace/namespace_name.js';
import {InjectTokens} from './dependency_injection/inject_tokens.js';
import {type ArgvStruct, type AnyListrContext, type AnyObject, type AnyYargs} from '../types/aliases.js';
import {type Optional, type SoloListrTaskWrapper} from '../types/index.js';
import path from 'path';

/**
 * ConfigManager cache command flag values so that user doesn't need to enter the same values repeatedly.
 *
 * For example, 'namespace' is usually remains the same across commands once it is entered, and therefore user
 * doesn't need to enter it repeatedly. However, user should still be able to specify the flag explicitly for any command.
 */
@injectable()
export class ConfigManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public config!: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly _configMaps = new Map<string, any>();

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);

    this.reset();
  }

  /** Reset config */
  public reset(): void {
    this.config = {
      flags: {},
      version: helpers.getSoloVersion(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Apply the command flags precedence
   *
   * It uses the below precedence for command flag values:
   *  1. User input of the command flag
   *  2. Default value of the command flag if the command is not 'init'.
   */
  public applyPrecedence(argv: yargs.Argv<AnyYargs>, aliases: AnyObject): yargs.Argv<AnyYargs> {
    for (const key of Object.keys(aliases)) {
      const flag = flags.allFlagsMap.get(key);
      if (flag) {
        if (argv[key] !== undefined) {
          // argv takes precedence, nothing to do
        } else if (this.hasFlag(flag)) {
          argv[key] = this.getFlag(flag);
        } else {
          argv[key] = flag.definition.defaultValue;
        }
      }
    }

    return argv;
  }

  /** Update the config using the argv */
  public update(argv: ArgvStruct): void {
    if (!argv || Object.keys(argv).length === 0) return;

    for (const flag of flags.allFlags) {
      if (argv[flag.name] === undefined) continue;

      let val = argv[flag.name];
      switch (flag.definition.type) {
        case 'string':
          if (val && (flag.name === flags.chartDirectory.name || flag.name === flags.cacheDir.name)) {
            this.logger.debug(
              `Resolving directory path for '${flag.name}': ${val}, to: ${paths.resolve(val)}, note: ~/ is not supported`,
            );
            val = paths.resolve(val);
          }
          // if it is a namespace flag then convert it to NamespaceName
          else if (val && (flag.name === flags.namespace.name || flag.name === flags.clusterSetupNamespace.name)) {
            if (val instanceof NamespaceName) {
              this.config.flags[flag.name] = val;
            } else {
              this.config.flags[flag.name] = NamespaceName.of(val);
            }
            break;
          }
          this.config.flags[flag.name] = `${val}`; // force convert to string
          break;

        case 'number':
          try {
            if (flags.integerFlags.has(flag.name)) {
              this.config.flags[flag.name] = Number.parseInt(val);
            } else {
              this.config.flags[flag.name] = Number.parseFloat(val);
            }
          } catch (e) {
            throw new SoloError(`invalid number value '${val}': ${e.message}`, e);
          }
          break;

        case 'boolean':
          this.config.flags[flag.name] = val === true || val === 'true'; // use comparison to enforce boolean value
          break;

        case 'StorageType':
          // @ts-expect-error: TS2475: const enums can only be used in property or index access expressions
          if (!Object.values(constants.StorageType).includes(`${val}`)) {
            throw new SoloError(`Invalid storage type value '${val}'`);
          } else {
            this.config.flags[flag.name] = val;
          }
          break;
        default:
          throw new SoloError(`Unsupported field type for flag '${flag.name}': ${flag.definition.type}`);
      }
    }

    // store last command that was run
    if (argv._) {
      this.config.lastCommand = argv._;
    }

    this.config.updatedAt = new Date().toISOString();

    const flagMessage = Object.entries(this.config.flags)
      .filter(entries => entries[1] !== undefined && entries[1] !== null)
      .map(([key, value]) => {
        const flag = flags.allFlagsMap.get(key);
        const dataMask: Optional<string> = flag.definition.dataMask;

        return `${key}=${dataMask ? dataMask : value}`;
      })
      .join(', ');

    if (flagMessage) this.logger.debug(`Updated config with flags: ${flagMessage}`);
  }

  /** Check if a flag value is set */
  public hasFlag(flag: CommandFlag): boolean {
    return this.config.flags[flag.name] !== undefined;
  }

  /**
   * Return the value of the given flag
   * @returns value of the flag or undefined if flag value is not available
   */
  public getFlag<T = string>(flag: CommandFlag): T {
    return this.config.flags[flag.name] !== undefined ? this.config.flags[flag.name] : undefined;
  }

  /** Set value for the flag */
  public setFlag<T>(flag: CommandFlag, value: T): void {
    if (!flag || !flag.name) throw new MissingArgumentError('flag must have a name');
    // if it is a namespace then convert it to NamespaceName
    if (flag.name === flags.namespace.name || flag.name === flags.clusterSetupNamespace.name) {
      if (value instanceof NamespaceName) {
        this.config.flags[flag.name] = value;
        return;
      }

      this.config.flags[flag.name] = NamespaceName.of(value as string);
      return;
    }
    this.config.flags[flag.name] = value;
  }

  /** Get package version */
  public getVersion(): string {
    return this.config.version;
  }

  /**
   * Run prompts for the given set of flags
   * @param task task object from listr2
   * @param flagList list of flag objects
   */
  public async executePrompt(task: SoloListrTaskWrapper<AnyListrContext>, flagList: CommandFlag[] = []): Promise<void> {
    for (const flag of flagList) {
      if (flag.definition.disablePrompt || flag.prompt === undefined) {
        continue;
      }

      if (this.getFlag(Flags.quiet)) {
        return;
      }
      const input = await flag.prompt(task, this.getFlag(flag));
      this.setFlag(flag, input);
    }
  }

  /**
   * Dynamically builds a class with properties from the provided list of flags
   * and extra properties, will keep track of which properties are used.  Call
   * getUnusedConfigs() to get an array of unused properties.
   */
  public getConfig(configName: string, flags: CommandFlag[], extraProperties: string[] = []): object {
    const self = this;
    // build the dynamic class that will keep track of which properties are used
    const NewConfigClass = class {
      private usedConfigs: Map<string, number>;
      constructor() {
        // the map to keep track of which properties are used
        this.usedConfigs = new Map();

        // add the flags as properties to this class
        flags?.forEach(flag => {
          // @ts-ignore
          this[`_${flag.constName}`] = self.getFlag(flag);
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
    self._configMaps.set(configName, newConfigInstance);

    return newConfigInstance;
  }

  /**
   * Get the list of unused configurations that were not accessed
   * @returns an array of unused configurations
   */
  public getUnusedConfigs(configName: string): string[] {
    return this._configMaps.get(configName).getUnusedConfigs();
  }

  public getFlagFile(flag: CommandFlag): string {
    if (this.getFlag(flag) === flag.definition.defaultValue) {
      const cacheDir: string =
        this.getFlag<string>(flags.cacheDir) || (flags.cacheDir.definition.defaultValue as string);
      return path.join(cacheDir, this.getFlag(flag));
    }
    return this.getFlag(flag);
  }
}
