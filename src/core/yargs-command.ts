// SPDX-License-Identifier: Apache-2.0

import {Flags as commandFlags} from '../commands/flags.js';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {SoloError} from './errors/solo-error.js';
import {type BaseCommand} from '../commands/base.js';
import {type CommandFlag} from '../types/flag-types.js';

export class YargsCommand {
  constructor(
    opts: {command: string; description: string; commandDef: BaseCommand | any; handler: string},
    flags: {requiredFlags: CommandFlag[]; requiredFlagsWithDisabledPrompt: CommandFlag[]; optionalFlags: CommandFlag[]},
  ) {
    const {command, description, commandDef, handler} = opts;
    const {requiredFlags, requiredFlagsWithDisabledPrompt, optionalFlags} = flags;

    if (!command) throw new IllegalArgumentError("A string is required as the 'command' property", command);
    if (!description) throw new IllegalArgumentError("A string is required as the 'description' property", description);
    if (!requiredFlags)
      throw new IllegalArgumentError(
        "An array of CommandFlag is required as the 'requiredFlags' property",
        requiredFlags,
      );
    if (!requiredFlagsWithDisabledPrompt)
      throw new IllegalArgumentError(
        "An array of CommandFlag is required as the 'requiredFlagsWithDisabledPrompt' property",
        requiredFlagsWithDisabledPrompt,
      );
    if (!optionalFlags)
      throw new IllegalArgumentError(
        "An array of CommandFlag is required as the 'optionalFlags' property",
        optionalFlags,
      );
    if (!commandDef)
      throw new IllegalArgumentError("An instance of BaseCommand is required as the 'commandDef' property", commandDef);
    if (!handler) throw new IllegalArgumentError("A string is required as the 'handler' property", handler);

    let commandNamespace = '';
    if (commandDef.getCommandDefinition) {
      const definition = commandDef.getCommandDefinition();
      if (definition && definition.command) {
        commandNamespace = commandDef.getCommandDefinition().command;
      }
    }

    const allFlags = [...requiredFlags, ...requiredFlagsWithDisabledPrompt, ...optionalFlags];

    return {
      command,
      desc: description,
      builder: (y: any) => commandFlags.setCommandFlags(y, ...allFlags),
      handler: async (argv: any) => {
        commandDef.logger.info(`==== Running '${commandNamespace} ${command}' ===`);
        commandDef.logger.info(argv);
        await commandDef.handlers[handler](argv)
          .then((r: any) => {
            commandDef.logger.info(`==== Finished running '${commandNamespace} ${command}' ====`);
            if (!r) throw new SoloError(`${commandNamespace} ${command} failed, expected returned value to be true`);
          })
          .catch((err: Error | any) => {
            commandDef.logger.showUserError(err);
            throw new SoloError(`${commandNamespace} ${command} failed: ${err.message}`, err);
          });
      },
    };
  }
}
