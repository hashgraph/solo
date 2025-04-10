// SPDX-License-Identifier: Apache-2.0

import * as ContextFlags from './flags.js';
import {YargsCommand} from '../../core/yargs-command.js';
import {BaseCommand, type Options} from './../base.js';
import {type ClusterCommandHandlers} from './handlers.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type AnyYargs} from '../../types/aliases.js';
import {type CommandDefinition} from '../../types/index.js';

/**
 * Defines the core functionalities of 'node' command
 */
export class ClusterCommand extends BaseCommand {
  public handlers: ClusterCommandHandlers;

  constructor(options: Options) {
    super(options);

    this.handlers = patchInject(null, InjectTokens.ClusterCommandHandlers, this.constructor.name);
  }

  public static readonly COMMAND_NAME = 'cluster-ref';

  public getCommandDefinition(): CommandDefinition {
    return {
      command: ClusterCommand.COMMAND_NAME,
      desc: 'Manage solo testing cluster',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command(
            new YargsCommand(
              {
                command: 'connect',
                description: 'associates a cluster reference to a k8s context',
                commandDef: this,
                handler: 'connect',
              },
              ContextFlags.CONNECT_FLAGS,
            ),
          )
          .command(
            new YargsCommand(
              {
                command: 'disconnect',
                description: 'dissociates a cluster reference from a k8s context',
                commandDef: this,
                handler: 'disconnect',
              },
              ContextFlags.DEFAULT_FLAGS,
            ),
          )
          .command(
            new YargsCommand(
              {
                command: 'list',
                description: 'List all available clusters',
                commandDef: this,
                handler: 'list',
              },
              ContextFlags.NO_FLAGS,
            ),
          )
          .command(
            new YargsCommand(
              {
                command: 'info',
                description: 'Get cluster info',
                commandDef: this,
                handler: 'info',
              },
              ContextFlags.DEFAULT_FLAGS,
            ),
          )
          .command(
            new YargsCommand(
              {
                command: 'setup',
                description: 'Setup cluster with shared components',
                commandDef: this,
                handler: 'setup',
              },
              ContextFlags.SETUP_FLAGS,
            ),
          )
          .command(
            new YargsCommand(
              {
                command: 'reset',
                description: 'Uninstall shared components from cluster',
                commandDef: this,
                handler: 'reset',
              },
              ContextFlags.RESET_FLAGS,
            ),
          )
          .demandCommand(1, 'Select a context command');
      },
    };
  }

  close(): Promise<void> {
    // no-op
    return Promise.resolve();
  }
}
