// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {Flags as flags} from '../commands/flags.js';
import {FlagValidation} from '../commands/validation/flag-validation.js';
import chalk from 'chalk';
import {type CommandFlag} from '../types/flag-types.js';
import {type FlagDeprecation} from '../types/flag-deprecation.js';
import {type RegisteredDeprecation} from '../types/registered-deprecation.js';
import {Deprecations} from './deprecations.js';
import {type DeprecationRegistry} from './deprecation-registry.js';

import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type ConfigManager} from './config-manager.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type AnyObject, ArgvStruct} from '../types/aliases.js';
import {type ClusterReferenceName} from './../types/index.js';
import {SilentBreak} from './errors/silent-break.js';
import {type HelpRenderer} from './help-renderer.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {inject, injectable} from 'tsyringe-neo';
import {LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {K8} from '../integration/kube/k8.js';
import {type TaskList} from './task-list/task-list.js';
import {Listr, ListrContext, ListrRendererValue} from 'listr2';
import {SoloErrors} from './errors/solo-errors.js';
import {NpmClient} from '../integration/npm/npm-client.js';
import * as constants from './constants.js';
import {PathEx} from '../business/utils/path-ex.js';
import {FilePermissions} from '../business/utils/file-permissions.js';

@injectable()
export class Middlewares {
  private static hasShownDevSystemFileLists: boolean = false;

  public constructor(
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.HelpRenderer) private readonly helpRenderer: HelpRenderer,
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.NpmClient) private readonly npmClient: NpmClient,
    @inject(InjectTokens.DeprecationRegistry) private readonly deprecationRegistry: DeprecationRegistry,
  ) {
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.helpRenderer = patchInject(helpRenderer, InjectTokens.HelpRenderer, this.constructor.name);
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.npmClient = patchInject(npmClient, InjectTokens.NpmClient, this.constructor.name);
    this.deprecationRegistry = patchInject(
      deprecationRegistry,
      InjectTokens.DeprecationRegistry,
      this.constructor.name,
    );
  }

  public initSystemFiles(): (argv: ArgvStruct) => AnyObject {
    return async (argv: ArgvStruct): Promise<AnyObject> => {
      const cacheDirectory: string =
        (this.configManager.getFlag<string>(flags.cacheDir) as string) || (constants.SOLO_CACHE_DIR as string);

      const directories: string[] = [
        constants.SOLO_HOME_DIR as string,
        constants.SOLO_LOGS_DIR as string,
        cacheDirectory,
        constants.SOLO_VALUES_DIR as string,
      ];

      const tasks: Listr<ListrContext, ListrRendererValue, ListrRendererValue> = this.taskList.newTaskList(
        [
          {
            title: 'Setup home directory and cache',
            task: (): void => {
              for (const directoryPath of directories) {
                if (!fs.existsSync(directoryPath)) {
                  try {
                    fs.mkdirSync(directoryPath, {recursive: true});
                  } catch (error) {
                    throw new SoloErrors.system.directoryCreationFailed(error);
                  }
                }
                this.logger.debug(`OK: setup directory: ${directoryPath}`);
              }
            },
          },
          {
            title: 'Create local configuration',
            skip: (): boolean => this.localConfig.configFileExists(),
            task: async (): Promise<void> => {
              await this.localConfig.load();
            },
          },
          {
            title: `Copy templates in '${cacheDirectory}'`,
            task: (): void => {
              let directoryCreated: boolean = false;
              const directoryName: string = 'templates';
              const sourceDirectory: string = PathEx.safeJoinWithBaseDirConfinement(
                constants.RESOURCES_DIR as string,
                directoryName,
              );
              if (!fs.existsSync(sourceDirectory)) {
                return;
              }

              const destinationDirectory: string = PathEx.join(cacheDirectory, directoryName);
              if (!fs.existsSync(destinationDirectory)) {
                directoryCreated = true;
                fs.mkdirSync(destinationDirectory, {recursive: true});
              }

              fs.cpSync(sourceDirectory, destinationDirectory, {recursive: true});
              // cpSync preserves the packaged source mode (0755) and bypasses the process umask.
              FilePermissions.restrictTreeToOwner(destinationDirectory);

              if (argv.debug && !Middlewares.hasShownDevSystemFileLists) {
                this.logger.showList('Home Directories', directories);
                Middlewares.hasShownDevSystemFileLists = true;
              }

              if (directoryCreated) {
                this.logger.showUser(
                  chalk.grey(
                    '\n***************************************************************************************',
                  ),
                );
                this.logger.showUser(
                  chalk.grey(
                    `Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: ${constants.SOLO_HOME_DIR as string}\n` +
                      "If a full reset is needed, delete the directory or relevant sub-directories before running 'solo'.",
                  ),
                );
                this.logger.showUser(
                  chalk.grey('***************************************************************************************'),
                );
              }
            },
          },
        ],
        {renderer: 'silent'},
      );

      if (tasks.isRoot()) {
        try {
          await tasks.run();
        } catch (error) {
          throw new SoloErrors.system.initSystemFilesFailed(error);
        }
      }

      return argv;
    };
  }

  public printCustomHelp(rootCmd: any): (argv: ArgvStruct) => void {
    /**
     * @param argv - listr Argv
     */
    return (argv: ArgvStruct): void => {
      if (!argv['help']) {
        return;
      }

      rootCmd.showHelp((output: string): void => {
        this.helpRenderer.render(rootCmd, output);
      });
      throw new SilentBreak('printed help, exiting');
    };
  }

  public setLoggerDebugFlag(): (argv: ArgvStruct) => AnyObject {
    const logger: SoloLogger = this.logger;

    /**
     * @param argv - listr Argv
     */
    return (argv: ArgvStruct): AnyObject => {
      if (argv.debug) {
        logger.debug('Setting logger debug flag');
        logger.setDevMode(argv.debug);
      }

      return argv;
    };
  }

  /**
   * Warns the user, once per invocation, whenever a deprecated flag is supplied. Flag deprecations are
   * discovered from the flag registry ({@link Definition.deprecated}): a flag deprecated outright warns
   * wherever it is supplied, while a flag deprecated only for certain commands
   * ({@link FlagDeprecation.commands}) warns solely when one of those commands — or an operation beneath it
   * — was invoked. The `--dev` alias of `--debug` is a narrower alias-only deprecation handled explicitly.
   */
  public warnDeprecatedFlags(): (argv: ArgvStruct) => AnyObject {
    const logger: SoloLogger = this.logger;

    return (argv: ArgvStruct): AnyObject => {
      const commandPath: string = (argv._ ?? []).join(' ').trim();

      for (const flag of flags.allFlags) {
        const deprecation: FlagDeprecation | undefined = flag.definition.deprecated;
        if (!deprecation || !Middlewares.isFlagSupplied(flag)) {
          continue;
        }

        if (!Deprecations.appliesToCommand(deprecation, commandPath)) {
          continue;
        }

        // Name the invoked command in the warning for a scoped deprecation, so it is clear the flag is
        // still supported elsewhere.
        const commandScope: string | undefined = Deprecations.commandScope(deprecation) ? commandPath : undefined;
        logger.showUser(
          chalk.yellow(`⚠ ${Deprecations.formatDeprecationMessage(`--${flag.name}`, deprecation, commandScope)}`),
        );
      }

      // `--dev` is the deprecated alias of `--debug`. Only the alias is deprecated (the `--debug` flag itself
      // is not), so it cannot be expressed as a whole-flag deprecation and is detected explicitly here.
      if (process.argv.includes('--dev')) {
        logger.showUser(
          chalk.yellow(
            `⚠ ${Deprecations.formatDeprecationMessage('--dev', {since: '0.84.0', removalIssue: 5181, replacement: '--debug'})}`,
          ),
        );
      }

      return argv;
    };
  }

  /**
   * Warns the user, once per invocation, when the command they ran is deprecated. This is the single,
   * framework-level place command/subcommand deprecation warnings are emitted — individual command classes
   * only declare a deprecation (which the {@link DeprecationRegistry} collects); they never print the warning
   * themselves. A deprecated command group warns for every operation beneath it (prefix match).
   */
  public warnDeprecatedCommands(): (argv: ArgvStruct) => AnyObject {
    const logger: SoloLogger = this.logger;
    const deprecationRegistry: DeprecationRegistry = this.deprecationRegistry;

    return (argv: ArgvStruct): AnyObject => {
      const commandPath: string = (argv._ ?? []).join(' ').trim();
      if (!commandPath) {
        return argv;
      }

      // Match the most specific deprecated command/subcommand for the invoked path: an exact match, or a
      // deprecated ancestor group that the invoked path falls under. The longest matching feature wins.
      let match: RegisteredDeprecation | undefined;
      for (const entry of deprecationRegistry.list()) {
        const matches: boolean =
          entry.kind !== 'flag' && (commandPath === entry.feature || commandPath.startsWith(`${entry.feature} `));
        if (matches && (!match || entry.feature.length > match.feature.length)) {
          match = entry;
        }
      }

      if (match) {
        logger.showUser(chalk.yellow(`⚠ ${Deprecations.formatDeprecationMessage(match.feature, match.deprecation)}`));
      }

      return argv;
    };
  }

  /** Returns true when the given flag (by its name or any alias) was supplied on the command line. */
  private static isFlagSupplied(flag: CommandFlag): boolean {
    const tokens: string[] = [`--${flag.name}`];
    const camelCaseName: string = flag.name.replaceAll(/-([a-z])/g, (_: string, letter: string): string =>
      letter.toUpperCase(),
    );
    if (camelCaseName !== flag.name) {
      tokens.push(`--${camelCaseName}`);
    }
    const alias: string | string[] | undefined = flag.definition.alias;
    const aliases: string[] = [];
    if (Array.isArray(alias)) {
      aliases.push(...alias);
    } else if (alias !== undefined) {
      aliases.push(alias);
    }
    for (const singleAlias of aliases) {
      tokens.push(singleAlias.length === 1 ? `-${singleAlias}` : `--${singleAlias}`);
    }

    return tokens.some(
      (token: string): boolean =>
        process.argv.includes(token) ||
        process.argv.some((argument: string): boolean => argument.startsWith(`${token}=`)),
    );
  }

  public detectLocalSoloPackages(): (argv: ArgvStruct) => AnyObject {
    const SOLO_PACKAGES_TO_UNLINK: string[] = ['@hashgraph/solo', '@hiero-ledger/solo'];

    /**
     * @param argv - listr Argv
     */
    return async (argv: ArgvStruct): Promise<AnyObject> => {
      try {
        const listResult: string[] = await this.npmClient.listGlobal();

        for (const item of listResult) {
          // Check if any of the globally linked packages match the SOLO_PACKAGES_TO_UNLINK
          // and unlink them if they point to a local directory (indicated by '->' in the npm list output)
          const matchesSoloPackages: string[] = SOLO_PACKAGES_TO_UNLINK.filter(
            (soloPackage: string): boolean => item.includes(soloPackage) && item.includes('->'),
          );
          for (const packageName of matchesSoloPackages) {
            try {
              const logMessage: string = `Warning: Found locally linked installation of ${packageName}.`;
              this.logger.showUser(chalk.yellow(logMessage));
              this.logger.info(logMessage);
            } catch {
              this.logger.error(
                new SoloErrors.system.initSystemFilesFailed(
                  new Error(
                    `Failed to parse npm list output line "${item}". Please check for any globally linked Solo packages and unlink them manually using "npm unlink -g <package-name>".`,
                  ),
                ),
              );
            }
          }
        }
      } catch {
        this.logger.warn(
          new SoloErrors.system.initSystemFilesFailed(
            new Error(
              'Failed to detect globally linked Solo packages. Please check for any globally linked Solo packages and unlink them manually using "npm unlink -g <package-name>".',
            ),
          ),
        );
      }

      return argv;
    };
  }

  /**
   * Processes the Argv and display the command header
   *
   * @returns callback function to be executed from listr
   */
  protected processArgumentsAndDisplayHeader(): (argv: ArgvStruct, yargs: any) => AnyObject {
    const k8Factory: K8Factory = this.k8Factory;
    const configManager: ConfigManager = this.configManager;
    const logger: SoloLogger = this.logger;

    /**
     * @param argv - listr Argv
     * @param yargs - listr Yargs
     */
    return (argv: any, yargs: any): AnyObject => {
      logger.debug('Processing arguments and displaying header');

      let clusterName: string = 'N/A';
      let contextName: string = 'N/A';

      // set cluster and namespace in the global configManager from kubernetes context
      // so that we don't need to prompt the user
      try {
        const k8: K8 = k8Factory.default();
        const contextNamespace: NamespaceName = k8.contexts().readCurrentNamespace();
        const currentClusterName: string = k8.clusters().readCurrent();
        contextName = k8.contexts().readCurrent();
        clusterName = configManager.getFlag<ClusterReferenceName>(flags.clusterRef) || currentClusterName;

        // Set namespace if not provided
        if (contextNamespace?.name) {
          configManager.setFlag(flags.namespace, contextNamespace);
        }
      } catch {
        /* empty */
      }

      // capture which flags the user explicitly supplied, before precedence backfills defaults
      // and rewrites legacy aliases (needed to resolve upgrade versions from remote config)
      configManager.recordUserSuppliedFlags(argv, yargs.parsed?.defaulted ?? {});

      // apply precedence for flags
      argv = configManager.applyPrecedence(argv, yargs.parsed.aliases);

      // Before update(), which coerces some values and would report its own error instead of a flag-scoped one.
      FlagValidation.assertAllValid(flags.allFlags, argv);

      // update config manager
      configManager.update(argv);

      // Build data to be displayed
      const currentCommand: string = argv._.join(' ');
      const commandArguments: string = flags.stringifyArgv(argv);
      const commandData: string = (currentCommand + ' ' + commandArguments).trim();

      // Check if output format is set (machine-readable modes: json, yaml, wide)
      const outputFormat: string = configManager.getFlag<string>(flags.output) || '';
      const isMachineReadable: boolean = ['json', 'yaml', 'wide'].includes(outputFormat);

      if (this.taskList.parentTaskListMap.size === 0 && !isMachineReadable) {
        // Display command header (skip in machine-readable output modes)
        logger.showUser(
          chalk.cyan('\n******************************* Solo *********************************************'),
        );
        logger.showUser(chalk.cyan('Version\t\t\t:'), chalk.yellow(configManager.getVersion()));
        logger.showUser(chalk.cyan('Kubernetes Context\t:'), chalk.yellow(contextName));
        logger.showUser(chalk.cyan('Kubernetes Cluster\t:'), chalk.yellow(clusterName));
        logger.showUser(chalk.cyan('Current Command\t\t:'), chalk.yellow(commandData));
        if (configManager.getFlag<NamespaceName>(flags.namespace)?.name) {
          logger.showUser(chalk.cyan('Kubernetes Namespace\t:'), chalk.yellow(configManager.getFlag(flags.namespace)));
        }
        logger.showUser(
          chalk.cyan('**********************************************************************************'),
        );
      }

      return argv;
    };
  }
}
