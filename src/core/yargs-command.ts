// SPDX-License-Identifier: Apache-2.0

import {Flags as commandFlags} from '../commands/flags.js';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {SoloError} from './errors/solo-error.js';
import {type BaseCommand} from '../commands/base.js';
import {type CommandFlag} from '../types/flag-types.js';

export class YargsCommand {
  constructor(
    options: {command: string; description: string; commandDef: BaseCommand | any; handler: string},
    flags: {required: CommandFlag[]; optional: CommandFlag[]},
  ) {
    const {command, description, commandDef, handler} = options;
    const {required, optional} = flags;

    if (!command) {
      throw new IllegalArgumentError("A string is required as the 'command' property", command);
    }
    if (!description) {
      throw new IllegalArgumentError("A string is required as the 'description' property", description);
    }
    if (!required) {
      throw new IllegalArgumentError("An array of CommandFlag is required as the 'required' property", required);
    }
    if (!optional) {
      throw new IllegalArgumentError("An array of CommandFlag is required as the 'optional' property", optional);
    }
    if (!commandDef) {
      throw new IllegalArgumentError("An instance of BaseCommand is required as the 'commandDef' property", commandDef);
    }
    if (!handler) {
      throw new IllegalArgumentError("A string is required as the 'handler' property", handler);
    }

    let commandNamespace = '';
    if (commandDef.getCommandDefinition) {
      const definition = commandDef.getCommandDefinition();
      if (definition && definition.command) {
        commandNamespace = commandDef.getCommandDefinition().command;
      }

      return {
        command,
        desc: description,
        builder: (y: any) => {
          commandFlags.setRequiredCommandFlags(y, ...required);
          commandFlags.setOptionalCommandFlags(y, ...optional);
        },
        handler: async (argv: any) => {
          commandDef.logger.info(`==== Running '${commandNamespace} ${command}' ===`);
          commandDef.logger.info(argv);
          await commandDef.handlers[handler](argv)
            .then((r: any) => {
              commandDef.logger.info(`==== Finished running '${commandNamespace} ${command}' ====`);
              if (!r) {
                throw new SoloError(`${commandNamespace} ${command} failed, expected returned value to be true`);
              }
            })
            .catch((error: Error | any) => {
              commandDef.logger.showUserError(error);
              throw new SoloError(`${commandNamespace} ${command} failed: ${error.message}`, error);
            });
        },
      };
    }
  }
}
