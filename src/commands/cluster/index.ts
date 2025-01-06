/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import * as ContextFlags from './flags.js';
import {YargsCommand} from '../../core/yargs_command.js';
import {BaseCommand} from './../base.js';
import {type Opts} from '../../types/command_types.js';
import {ClusterCommandTasks} from './tasks.js';
import {ClusterCommandHandlers} from './handlers.js';
import {DEFAULT_FLAGS, RESET_FLAGS, SETUP_FLAGS} from "./flags.js";

/**
 * Defines the core functionalities of 'node' command
 */
export class ClusterCommand extends BaseCommand {
  public handlers: ClusterCommandHandlers;

  constructor(opts: Opts) {
    super(opts);

    this.handlers = new ClusterCommandHandlers(this, new ClusterCommandTasks(this), this.remoteConfigManager);
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
              ContextFlags.USE_FLAGS,
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
