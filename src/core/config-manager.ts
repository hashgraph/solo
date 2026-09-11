// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import {inject, injectable} from 'tsyringe-neo';
import {type SoloLogger} from './logging/solo-logger.js';
import {Flags, Flags as flags} from '../commands/flags.js';
import type * as yargs from 'yargs';
import {type CommandFlag} from '../types/flag-types.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {StorageType} from './constants.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type ArgvStruct, type AnyListrContext, type AnyObject, type AnyYargs} from '../types/aliases.js';
import {type Optional, type SoloListrTaskWrapper} from '../types/index.js';
import {PathEx} from '../business/utils/path-ex.js';
import {getSoloVersion} from '../../version.js';
import {isValidEnum} from './util/validation-helpers.js';
import {AsyncLocalStorage} from 'node:async_hooks';

interface ConfigMapEntry {
  getUnusedConfigs: () => string[];
}

interface LegacyVersionAliasMapping {
  canonical: CommandFlag;
  legacy: CommandFlag;
}

/**
 * ConfigManager cache command flag values so that user doesn't need to enter the same values repeatedly.
 *
 * For example, 'namespace' is usually remains the same across commands once it is entered, and therefore user
 * doesn't need to enter it repeatedly. However, user should still be able to specify the flag explicitly for any command.
 */
@injectable()
export class ConfigManager {
  public config!: AnyObject;
  protected readonly _configMaps: Map<string, ConfigMapEntry> = new Map<string, ConfigMapEntry>();
  // Parallel subcommands used to mutate `this.config` directly, which made
  // argv/flag resolution nondeterministic. Each command flow now runs against
  // its own scoped config snapshot to keep reads/writes isolated.
  private readonly configScope: AsyncLocalStorage<AnyObject> = new AsyncLocalStorage<AnyObject>();

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);

    this.reset();
  }

  private applyLegacyVersionArgAliases(argv: ArgvStruct): void {
    const aliasMappings: LegacyVersionAliasMapping[] = [
      {canonical: flags.consensusNodeVersion, legacy: flags.releaseTag},
      {canonical: flags.relayVersion, legacy: flags.relayReleaseTag},
    ];

    for (const {canonical, legacy} of aliasMappings) {
      const canonicalValue: unknown = argv[canonical.name];
      const legacyValue: unknown = argv[legacy.name];

      if (canonicalValue === undefined && legacyValue !== undefined) {
        argv[canonical.name] = legacyValue;
      }

      if (legacyValue === undefined && canonicalValue !== undefined) {
        argv[legacy.name] = canonicalValue;
      }
    }
  }

  private applyLegacyVersionConfigAliases(activeConfig: AnyObject): void {
    const aliasMappings: LegacyVersionAliasMapping[] = [
      {canonical: flags.consensusNodeVersion, legacy: flags.releaseTag},
      {canonical: flags.relayVersion, legacy: flags.relayReleaseTag},
    ];

    for (const {canonical, legacy} of aliasMappings) {
      const canonicalValue: unknown = activeConfig.flags[canonical.name];
      const legacyValue: unknown = activeConfig.flags[legacy.name];
      let resolvedValue: unknown = canonicalValue;
      if (resolvedValue === undefined || resolvedValue === '') {
        resolvedValue = legacyValue;
      }

      if (resolvedValue !== undefined && resolvedValue !== '') {
        activeConfig.flags[canonical.name] = resolvedValue;
        activeConfig.flags[legacy.name] = resolvedValue;
      }
    }
  }

  /** Reset config */
  public reset(): void {
    this.config = {
      flags: {},
      version: getSoloVersion(),
      updatedAt: new Date().toISOString(),
    };
  }

  private getActiveConfig(): AnyObject {
    // If no scope exists (normal single-command path), fallback to legacy
    // process-wide config behavior.
    return this.configScope.getStore() ?? this.config;
  }

  public cloneActiveConfig(): AnyObject {
    // Snapshot current effective config so child command flows can mutate it
    // without affecting siblings. Use a shallow spread of the flags map rather
    // than structuredClone: structuredClone strips class prototypes (e.g.
    // NamespaceName becomes a plain {name} object that stringifies to
    // "[object Object]"). NamespaceName instances are immutable so sharing
    // them by reference across scopes is safe.
    const active: ReturnType<ConfigManager['getActiveConfig']> = this.getActiveConfig();
    return {
      ...active,
      flags: {...active.flags},
    };
  }

  public runWithScopedConfig<T>(scopedConfig: AnyObject, callback: () => T): T {
    // Bind the scoped config to the entire async call chain.
    return this.configScope.run(scopedConfig, callback);
  }

  /**
   * Apply the command flags precedence
   *
   * It uses the below precedence for command flag values:
   *  1. User input of the command flag
   *  2. Default value of the command flag if the command is not 'init'.
   */
  public applyPrecedence(argv: yargs.Argv<AnyYargs>, aliases: AnyObject): yargs.Argv<AnyYargs> {
    const activeConfig: AnyObject = this.getActiveConfig();
    this.applyLegacyVersionArgAliases(argv as unknown as ArgvStruct);
    this.applyLegacyVersionConfigAliases(activeConfig);
    for (const key of Object.keys(aliases)) {
      const flag: CommandFlag = flags.allFlagsMap.get(key);
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

    activeConfig.updatedAt = new Date().toISOString();
    return argv;
  }

  /** Update the config using the argv */
  public update(argv: ArgvStruct): void {
    const activeConfig: AnyObject = this.getActiveConfig();
    if (!argv || Object.keys(argv).length === 0) {
      return;
    }

    this.applyLegacyVersionArgAliases(argv);

    for (const flag of flags.allFlags) {
      if (argv[flag.name] === undefined) {
        continue;
      }

      let value: ArgvStruct[string] = argv[flag.name];
      switch (flag.definition.type) {
        case 'string': {
          if (value && (flag.name === flags.chartDirectory.name || flag.name === flags.cacheDir.name)) {
            this.logger.debug(
              `Resolving directory path for '${flag.name}': ${value}, to: ${PathEx.resolve(value)}, note: ~/ is not supported`,
            );
            value = PathEx.resolve(value);
          }
          // if it is a namespace flag then convert it to NamespaceName
          else if (value && (flag.name === flags.namespace.name || flag.name === flags.clusterSetupNamespace.name)) {
            activeConfig.flags[flag.name] = value instanceof NamespaceName ? value : NamespaceName.of(value);
            break;
          }
          activeConfig.flags[flag.name] = `${value}`; // force convert to string
          break;
        }

        case 'number': {
          try {
            activeConfig.flags[flag.name] = flags.integerFlags.has(flag.name)
              ? Number.parseInt(value)
              : Number.parseFloat(value);
          } catch (error) {
            throw new SoloErrors.validation.invalidConfigNumberValue(value, error);
          }
          break;
        }

        case 'boolean': {
          activeConfig.flags[flag.name] = value === true || value === 'true'; // use comparison to enforce boolean value
          break;
        }

        case 'StorageType': {
          // @ts-expect-error: TS2475: const enums can only be used in property or index access expressions
          if (isValidEnum(`${value}`, StorageType)) {
            activeConfig.flags[flag.name] = value;
          } else {
            throw new SoloErrors.validation.invalidStorageType(value);
          }
          break;
        }
        default: {
          throw new SoloErrors.validation.unsupportedFlagFieldType(flag.name, flag.definition.type);
        }
      }
    }

    this.applyLegacyVersionConfigAliases(activeConfig);

    // store last command that was run
    if (argv._) {
      activeConfig.lastCommand = argv._;
    }

    activeConfig.updatedAt = new Date().toISOString();

    const flagMessage: string = Object.entries(activeConfig.flags)
      .filter((entries): boolean => entries[1] !== undefined && entries[1] !== null)
      .map(([key, value]): `${string}=${string}` => {
        const flag: CommandFlag = flags.allFlagsMap.get(key);
        const dataMask: Optional<string> = flag.definition.dataMask;

        return `${key}=${dataMask || value}`;
      })
      .join(', ');

    if (flagMessage) {
      this.logger.debug(`Updated config with flags: ${flagMessage}`);
    }
  }

  /** Check if a flag value is set */
  public hasFlag(flag: CommandFlag): boolean {
    return this.getActiveConfig().flags[flag.name] !== undefined;
  }

  /**
   * Record which flags the user explicitly supplied on the command line.
   *
   * A flag whose value comes from its default is indistinguishable from an explicitly supplied one
   * once {@link applyPrecedence} and {@link update} have run, because yargs backfills defaults and
   * rewrites legacy aliases. Capturing the raw parse here lets later resolution (e.g. upgrade
   * version precedence, see {@link wasFlagProvidedByUser}) tell the two apart.
   *
   * Must be called against the raw parsed argv, before {@link applyPrecedence}.
   *
   * @param argv - the raw parsed argv straight from yargs
   * @param defaulted - yargs' `parsed.defaulted` map: keys populated from their default value
   */
  public recordUserSuppliedFlags(argv: ArgvStruct, defaulted: Record<string, boolean>): void {
    const activeConfig: AnyObject = this.getActiveConfig();
    const suppliedFlags: Set<string> = new Set<string>();
    const defaultedKeys: Record<string, boolean> = defaulted ?? {};

    for (const flag of flags.allFlags) {
      const wasDefaulted: boolean = defaultedKeys[flag.name] === true || defaultedKeys[flag.constName] === true;
      if (!wasDefaulted && argv[flag.name] !== undefined) {
        suppliedFlags.add(flag.name);
      }
    }

    activeConfig.userSuppliedFlags = suppliedFlags;
  }

  /**
   * Whether the user explicitly supplied the given flag on the command line, as opposed to it being
   * populated from its default value. Relies on {@link recordUserSuppliedFlags} having run for the
   * current invocation.
   */
  public wasFlagProvidedByUser(flag: CommandFlag): boolean {
    const suppliedFlags: Optional<Set<string>> = this.getActiveConfig().userSuppliedFlags;
    return suppliedFlags?.has(flag.name) ?? false;
  }

  /**
   * Return the value of the given flag
   * @returns value of the flag or undefined if flag value is not available
   */
  public getFlag<T = string>(flag: CommandFlag): T {
    const activeConfig: AnyObject = this.getActiveConfig();
    return activeConfig.flags[flag.name] === undefined ? undefined : activeConfig.flags[flag.name];
  }

  /** Set value for the flag */
  public setFlag<T>(flag: CommandFlag, value: T): void {
    const activeConfig: AnyObject = this.getActiveConfig();
    if (!flag || !flag.name) {
      throw new SoloErrors.validation.missingArgument('flag must have a name');
    }
    // if it is a namespace then convert it to NamespaceName
    if (flag.name === flags.namespace.name || flag.name === flags.clusterSetupNamespace.name) {
      if (value instanceof NamespaceName) {
        activeConfig.flags[flag.name] = value;
        return;
      }

      activeConfig.flags[flag.name] = NamespaceName.of(value as string);
      return;
    }
    activeConfig.flags[flag.name] = value;
  }

  /** Get package version */
  public getVersion(): string {
    return this.getActiveConfig().version;
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
      const input: unknown = await flag.prompt(task, this.getFlag(flag));
      this.setFlag(flag, input);
    }
  }

  /**
   * Dynamically builds a class with properties from the provided list of flags
   * and extra properties, will keep track of which properties are used.  Call
   * getUnusedConfigs() to get an array of unused properties.
   */
  public getConfig(configName: string, flags: CommandFlag[], extraProperties: string[] = []): object {
    const getFlag: <T = string>(flag: CommandFlag) => T = this.getFlag.bind(this);

    // build the dynamic class that will keep track of which properties are used
    class NewConfigClass {
      private usedConfigs: Map<string, number>;
      public constructor() {
        // the map to keep track of which properties are used
        this.usedConfigs = new Map();

        // add the flags as properties to this class
        if (flags) {
          for (const flag of flags) {
            const constNameValue: unknown = getFlag(flag);
            if (this[`_${flag.constName}`] === undefined && constNameValue !== undefined) {
              this[`_${flag.constName}`] = constNameValue;
            }

            // Multiple CLI flags can intentionally share one config constName (legacy + canonical).
            // Define the accessor only once to avoid property redefinition errors.
            if (Object.hasOwn(this, flag.constName)) {
              continue;
            }

            this[`_${flag.constName}`] = constNameValue;
            Object.defineProperty(this, flag.constName, {
              get(): unknown {
                // eslint-disable-next-line unicorn/no-this-outside-of-class
                this.usedConfigs.set(flag.constName, this.usedConfigs.get(flag.constName) + 1 || 1);
                // eslint-disable-next-line unicorn/no-this-outside-of-class
                return this[`_${flag.constName}`];
              },
              set(value: unknown): void {
                // eslint-disable-next-line unicorn/no-this-outside-of-class
                this[`_${flag.constName}`] = value;
              },
            });
          }
        }

        // add the extra properties as properties to this class
        if (extraProperties) {
          for (const name of extraProperties) {
            if (Object.hasOwn(this, name)) {
              continue;
            }
            this[`_${name}`] = '';
            Object.defineProperty(this, name, {
              get(): unknown {
                // eslint-disable-next-line unicorn/no-this-outside-of-class
                this.usedConfigs.set(name, this.usedConfigs.get(name) + 1 || 1);
                // eslint-disable-next-line unicorn/no-this-outside-of-class
                return this[`_${name}`];
              },
              set(value: unknown): void {
                // eslint-disable-next-line unicorn/no-this-outside-of-class
                this[`_${name}`] = value;
              },
            });
          }
        }
      }

      /** Get the list of unused configurations that were not accessed */
      public getUnusedConfigs(): string[] {
        const unusedConfigs: string[] = [];

        // add the flag constName to the unusedConfigs array if it was not accessed
        if (flags) {
          for (const flag of flags) {
            if (!this.usedConfigs.has(flag.constName)) {
              unusedConfigs.push(flag.constName);
            }
          }
        }

        // add the extra properties to the unusedConfigs array if it was not accessed
        if (extraProperties) {
          for (const item of extraProperties) {
            if (!this.usedConfigs.has(item)) {
              unusedConfigs.push(item);
            }
          }
        }
        return unusedConfigs;
      }
    }

    const newConfigInstance: ConfigMapEntry = new NewConfigClass();

    // add the new instance to the configMaps so that it can be used to get the
    // unused configurations using the configName from the BaseCommand
    this._configMaps.set(configName, newConfigInstance);

    return newConfigInstance;
  }

  /**
   * Get the list of unused configurations that were not accessed
   * @returns an array of unused configurations
   */
  public getUnusedConfigs(configName: string): string[] {
    const configMapEntry: ConfigMapEntry | undefined = this._configMaps.get(configName);
    return configMapEntry ? configMapEntry.getUnusedConfigs() : [];
  }

  public getFlagFile(flag: CommandFlag): string {
    const value: string = this.getFlag(flag);
    if (value === flag.definition.defaultValue || !value) {
      const cacheDirectory: string =
        (this.getFlag(flags.cacheDir) as string) || (flags.cacheDir.definition.defaultValue as string);
      return PathEx.join(cacheDirectory, flag.definition.defaultValue as string);
    }
    return this.getFlag(flag);
  }
}
