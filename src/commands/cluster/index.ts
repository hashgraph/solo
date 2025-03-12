// SPDX-License-Identifier: Apache-2.0

import * as ContextFlags from './flags.js';
import {YargsCommand} from '../../core/yargs_command.js';
import {BaseCommand, type Opts} from './../base.js';
import {type ClusterCommandHandlers} from './handlers.js';
import {patchInject} from '../../core/dependency_injection/container_helper.js';
import {InjectTokens} from '../../core/dependency_injection/inject_tokens.js';
import {type AnyYargs} from '../../types/aliases.js';

/**
 * Defines the core functionalities of 'node' command
 */
export class ClusterCommand extends BaseCommand {
  public handlers: ClusterCommandHandlers;

  constructor(opts: Opts) {
    super(opts);

    this.handlers = patchInject(null, InjectTokens.ClusterCommandHandlers, this.constructor.name);
  }

  getCommandDefinition() {
    return {
      command: 'cluster-ref',
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
