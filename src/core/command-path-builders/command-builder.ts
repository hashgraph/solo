// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../errors/solo-error.js';
import {type AnyYargs, type ArgvStruct} from '../../types/aliases.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type BaseCommand} from '../../commands/base.js';
import {type CommandDefinition} from '../../types/index.js';

export class Subcommand {
  public constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly commandHandlerClass: BaseCommand,
    public readonly commandHandler: (argv: ArgvStruct) => Promise<boolean>,
    public readonly builder?: (yargs: AnyYargs) => void,
  ) {}
}

export class CommandGroup {
  public readonly subcommands: Subcommand[] = [];

  public constructor(
    public readonly name: string,
    public readonly description: string,
  ) {}

  public addSubcommand(subcommand: Subcommand): CommandGroup {
    this.subcommands.push(subcommand);
    return this;
  }
}

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

  public build(): CommandDefinition {
    const commandGroups: CommandGroup[] = this.commandGroups;
    const logger: SoloLogger = this.logger;

    const commandName: string = this.name;
    const commandDescription: string = this.description;
    const demandCommand: string = `select a ${commandName} command`;

    return {
      command: commandName,
      desc: commandDescription,
      builder: (yargs: AnyYargs): AnyYargs => {
        for (const commandGroup of commandGroups) {
          yargs.command({
            command: commandGroup.name,
            desc: commandGroup.description,
            builder: (yargs: AnyYargs): AnyYargs => {
              for (const subcommand of commandGroup.subcommands) {
                const handlerDefinition: CommandDefinition = {
                  command: subcommand.name,
                  desc: subcommand.description,
                  handler: async argv => {
                    const commandPath: string = `${commandName} ${commandGroup.name} ${subcommand.name}`;

                    logger.info(`==== Running '${commandPath}' ===`);

                    const handlerCallback: (argv: ArgvStruct) => Promise<boolean> = subcommand.commandHandler.bind(
                      subcommand.commandHandlerClass,
                    );

                    const response: boolean = await handlerCallback(argv);

                    logger.info(`==== Finished running '${commandPath}'====`);

                    if (!response) {
                      throw new SoloError(`Error running ${commandPath}, expected return value to be true`);
                    }
                  },
                };

                if (subcommand.builder) {
                  handlerDefinition.builder = subcommand.builder;
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
