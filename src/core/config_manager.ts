/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {inject, injectable} from 'tsyringe-neo';
import {SoloError, MissingArgumentError} from './errors.js';
import {type SoloLogger} from './logging.js';
import {Flags, Flags as flags} from '../commands/flags.js';
import * as paths from 'path';
import * as helpers from './helpers.js';
import type * as yargs from 'yargs';
import {type CommandFlag} from '../types/flag_types.js';
import {type ListrTaskWrapper} from 'listr2';
import {patchInject} from './dependency_injection/container_helper.js';
import * as constants from '../core/constants.js';
import {NamespaceName} from './kube/resources/namespace/namespace_name.js';
import {InjectTokens} from './dependency_injection/inject_tokens.js';

/**
 * ConfigManager cache command flag values so that user doesn't need to enter the same values repeatedly.
 *
 * For example, 'namespace' is usually remains the same across commands once it is entered, and therefore user
 * doesn't need to enter it repeatedly. However, user should still be able to specify the flag explicitly for any command.
 */
@injectable()
export class ConfigManager {
  config!: Record<string, any>;

  constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);

    this.reset();
  }

  /** Reset config */
  reset() {
    this.config = {
      flags: {},
      version: helpers.packageVersion(),
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
  applyPrecedence(argv: yargs.Argv<any>, aliases: any): yargs.Argv<any> {
    for (const key of Object.keys(aliases)) {
      const flag = flags.allFlagsMap.get(key);
      if (flag) {
        // @ts-ignore
        if (argv[key] !== undefined) {
          // argv takes precedence, nothing to do
        } else if (this.hasFlag(flag)) {
          // @ts-ignore
          argv[key] = this.getFlag(flag);
        } else {
          // @ts-ignore
          argv[key] = flag.definition.defaultValue;
        }
      }
    }

    return argv;
  }

  /** Update the config using the argv */
  update(argv: object | any = {}) {
    if (argv && Object.keys(argv).length > 0) {
      for (const flag of flags.allFlags) {
        if (argv[flag.name] !== undefined) {
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
                  break;
                }
                this.config.flags[flag.name] = NamespaceName.of(val);
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
              } catch (e: Error | any) {
                throw new SoloError(`invalid number value '${val}': ${e.message}`, e);
              }
              break;

            case 'boolean':
              this.config.flags[flag.name] = val === true || val === 'true'; // use comparison to enforce boolean value
              break;

            case 'StorageType':
              // @ts-ignore
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
      }

      // store last command that was run
      if (argv._) {
        this.config.lastCommand = argv._;
      }

      this.config.updatedAt = new Date().toISOString();
      let flagMessage = '';
      for (const key of Object.keys(this.config.flags)) {
        if (this.config.flags[key]) {
          flagMessage += `${key}=${this.config.flags[key]}, `;
        }
      }
      if (flagMessage) {
        this.logger.debug(`Updated config with flags: ${flagMessage}`);
      }
    }
  }

  /** Check if a flag value is set */
  hasFlag(flag: CommandFlag) {
    return this.config.flags[flag.name] !== undefined;
  }

  /**
   * Return the value of the given flag
   * @returns value of the flag or undefined if flag value is not available
   */
  getFlag<T>(flag: CommandFlag): undefined | T {
    if (this.config.flags[flag.name] !== undefined) {
      return this.config.flags[flag.name];
    }

    return undefined;
  }

  /** Set value for the flag */
  setFlag<T>(flag: CommandFlag, value: T) {
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
  getVersion(): string {
    return this.config.version;
  }

  /**
   * Run prompts for the given set of flags
   * @param task task object from listr2
   * @param flagList list of flag objects
   */
  async executePrompt(task: ListrTaskWrapper<any, any, any>, flagList: CommandFlag[] = []) {
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
}
