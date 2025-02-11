/**
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ContextFlags from './flags.js';
import {YargsCommand} from '../../core/yargs_command.js';
import {BaseCommand} from './../base.js';
import {type Opts} from '../../types/command_types.js';
import {ClusterCommandTasks} from './tasks.js';
import {ClusterCommandHandlers} from './handlers.js';
import {DEFAULT_FLAGS, RESET_FLAGS, SETUP_FLAGS} from './flags.js';

/**
 * Defines the core functionalities of 'node' command
 */
export class ClusterCommand extends BaseCommand {
  public handlers: ClusterCommandHandlers;

  constructor(opts: Opts) {
    super(opts);

    this.handlers = new ClusterCommandHandlers(this, new ClusterCommandTasks(this, this.k8), this.remoteConfigManager);
  }

  getCommandDefinition() {
    return {
      command: 'cluster',
      desc: 'Manage solo testing cluster',
      builder: (yargs: any) => {
        return yargs
          .command(
            new YargsCommand(
              {
                command: 'connect',
                description: 'updates the local configuration by connecting a deployment to a k8s context',
                commandDef: this,
                handler: 'connect',
              },
              ContextFlags.CONNECT_FLAGS,
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
              DEFAULT_FLAGS,
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
              DEFAULT_FLAGS,
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
              SETUP_FLAGS,
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
              RESET_FLAGS,
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
