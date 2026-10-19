// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../errors/solo-errors.js';
import {type AnyObject, type AnyYargs, type ArgvStruct} from '../../types/aliases.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type CommandDefinition, type SoloListrTask, type SoloListrTaskWrapper} from '../../types/index.js';
import {type CommandFlags} from '../../types/flag-types.js';
import {Flags as flags} from '../../commands/flags.js';
import {container, inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {type TaskList} from '../task-list/task-list.js';
import {Listr, type ListrContext, ListrRendererValue} from 'listr2';
import * as constants from '../constants.js';
import {SpinnerListrOptions} from '../spinner-listr-options.js';
import {type Deprecation} from '../../types/deprecation.js';
import {Deprecations} from '../deprecations.js';
import {type DeprecationRegistry} from '../deprecation-registry.js';
import {type DependencyManager} from '../dependency-managers/index.js';
import {type ChartManager} from '../chart-manager.js';
import {type ClusterTaskManager} from '../cluster-task-manager.js';
import {BaseCommand} from '../../commands/base.js';

export const ONE_SHOT_COMMAND: string = 'one-shot';
export const SINGLE_SUBCOMMAND: string = 'single';
export const SINGLE_DEPLOY: string = 'deploy';
export const SINGLE_DESTROY: string = 'destroy';

@injectable()
export class Subcommand {
  // TODO: Subcommand should have its own class file
  public constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly commandHandlerClass: any,
    public readonly commandHandler: (argv: ArgvStruct) => Promise<boolean>,
    public readonly flags: CommandFlags,
    public readonly dependencies: string[] = [],
    public readonly createCluster: boolean = false,
    public readonly deprecated?: Deprecation,
    @inject(InjectTokens.TaskList)
    private readonly taskList?: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.DependencyManager) private readonly depManager?: DependencyManager,
    @inject(InjectTokens.ChartManager) private readonly chartManager?: ChartManager,
    @inject(InjectTokens.ClusterTaskManager) private readonly clusterTaskManager?: ClusterTaskManager,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.depManager = patchInject(depManager, InjectTokens.DependencyManager, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.clusterTaskManager = patchInject(clusterTaskManager, InjectTokens.ClusterTaskManager, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public async installDependencies(
    useSmallMemoryCluster: boolean = false,
    collapseTasks: boolean = false,
  ): Promise<void> {
    if (!this.dependencies || this.dependencies.length === 0) {
      return;
    }

    const taskItems: SoloListrTask<AnyObject>[] = [
      BaseCommand.dockerDesktopPreflightTask(this.logger),
      {
        title: 'Check dependencies',
        task: async (_: AnyObject, task: SoloListrTaskWrapper<AnyObject>): Promise<unknown> => {
          const subTasks: SoloListrTask<AnyObject>[] = this.depManager.taskCheckDependencies<AnyObject>(
            this.dependencies,
          );
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        },
      },
    ];

    if (this.dependencies.includes(constants.HELM)) {
      taskItems.push({
        title: 'Setup chart manager',
        task: async (): Promise<void> => {
          await this.chartManager.setup();
        },
      });
    }

    if (this.createCluster) {
      taskItems.push(...this.clusterTaskManager.setupLocalClusterTasks(useSmallMemoryCluster));
    }

    const tasks: Listr<AnyObject, ListrRendererValue, ListrRendererValue> = this.taskList.newTaskList(
      taskItems,
      collapseTasks ? SpinnerListrOptions.build(true) : constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      this.name,
    );
    if (this.taskList.parentTaskListMap.size === 0) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.system.dependencyInstallFailed('dependencies', error);
      }
    }
  }
}

// TODO: CommandGroup should have its own class file
export class CommandGroup {
  public readonly subcommands: Subcommand[] = [];

  public constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly deprecated?: Deprecation,
  ) {}

  public addSubcommand(subcommand: Subcommand): CommandGroup {
    this.subcommands.push(subcommand);
    return this;
  }
}

// TODO: CommandBuilder should have its own class file
export class CommandBuilder {
  private readonly commandGroups: CommandGroup[] = [];

  public constructor(
    private readonly name: string,
    private readonly description: string,
    private readonly logger: SoloLogger,
  ) {}

  public addCommandGroup(commandGroup: CommandGroup): CommandBuilder {
    this.commandGroups.push(commandGroup);
    return this;
  }

  /**
   * Appends a `[DEPRECATED: ...]` marker to a command/subcommand description when it is deprecated, so the
   * deprecation is visible in `--help` output and therefore in the scraped documentation.
   */
  private static describeWithDeprecation(description: string, deprecation?: Deprecation): string {
    return deprecation ? `${description} [DEPRECATED: ${Deprecations.formatHelpMarker(deprecation)}]` : description;
  }

  public build(): CommandDefinition {
    const commandGroups: CommandGroup[] = this.commandGroups;
    const logger: SoloLogger = this.logger;
    const deprecationRegistry: DeprecationRegistry = container.resolve<DeprecationRegistry>(
      InjectTokens.DeprecationRegistry,
    );

    const commandName: string = this.name;
    const commandDescription: string = this.description;
    const demandCommand: string = `select a ${commandName} command`;

    // Register deprecations synchronously here (not inside the lazy yargs `builder` closures below, which
    // only run when yargs processes a specific command path) so the full set is available to non-runtime
    // consumers such as the build-time removal reminder and the documentation generator.
    for (const commandGroup of commandGroups) {
      if (commandGroup.deprecated) {
        deprecationRegistry.registerCommand(`${commandName} ${commandGroup.name}`, 'command', commandGroup.deprecated);
      }
      for (const subcommand of commandGroup.subcommands) {
        if (subcommand.deprecated) {
          deprecationRegistry.registerCommand(
            `${commandName} ${commandGroup.name} ${subcommand.name}`,
            'subcommand',
            subcommand.deprecated,
          );
        }
      }
    }

    return {
      command: commandName,
      desc: commandDescription,
      builder: (yargs: AnyYargs): AnyYargs => {
        for (const commandGroup of commandGroups) {
          yargs.command({
            command: commandGroup.name,
            desc: CommandBuilder.describeWithDeprecation(commandGroup.description, commandGroup.deprecated),
            builder: (yargs: AnyYargs): AnyYargs => {
              for (const subcommand of commandGroup.subcommands) {
                const subcommandPath: string = `${commandName} ${commandGroup.name} ${subcommand.name}`;

                const handlerDefinition: CommandDefinition = {
                  command: subcommand.name,
                  desc: CommandBuilder.describeWithDeprecation(subcommand.description, subcommand.deprecated),
                  handler: async (argv): Promise<void> => {
                    const commandPath: string = subcommandPath;

                    logger.info(`==== Running '${commandPath}' ===`);

                    const handlerCallback: (argv: ArgvStruct) => Promise<boolean> = subcommand.commandHandler.bind(
                      subcommand.commandHandlerClass,
                    );

                    const isOneShotSingleDeploy: boolean =
                      commandPath === `${ONE_SHOT_COMMAND} ${SINGLE_SUBCOMMAND} ${SINGLE_DEPLOY}`;
                    const isOneShotSingleDestroy: boolean =
                      commandPath === `${ONE_SHOT_COMMAND} ${SINGLE_SUBCOMMAND} ${SINGLE_DESTROY}`;
                    const useSmallMemoryCluster: boolean = isOneShotSingleDeploy;

                    // Collapse the dependency-install preamble (e.g. 'Check dependencies', 'Setup chart
                    // manager') to single spinner lines for one-shot single deploy (gated on parallel
                    // mode) and one-shot single destroy, matching their respective pipelines.
                    const collapseDependencyTasks: boolean =
                      (isOneShotSingleDeploy && argv[flags.parallelDeploy.name] !== false) || isOneShotSingleDestroy;

                    await subcommand.installDependencies(useSmallMemoryCluster, collapseDependencyTasks);
                    const response: boolean = await handlerCallback(argv);

                    logger.info(`==== Finished running '${commandPath}'====`);

                    if (!response) {
                      throw new SoloErrors.internal.commandReturnedFalse(commandName, commandPath);
                    }
                  },
                };

                if (subcommand.flags) {
                  handlerDefinition.builder = (y: AnyYargs): void => {
                    flags.setRequiredCommandFlags(y, subcommand.flags.required, subcommandPath);
                    flags.setOptionalCommandFlags(y, subcommand.flags.optional, subcommandPath);
                  };
                }

                yargs.command(handlerDefinition);
              }

              yargs.demandCommand(1, `Select a ${commandName} ${commandGroup.name} command`);
              return yargs;
            },
          });
        }

        yargs.demandCommand(1, demandCommand);

        return yargs;
      },
    };
  }
}
