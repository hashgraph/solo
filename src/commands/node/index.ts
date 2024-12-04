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

import {type AccountManager, YargsCommand} from '../../core/index.js';
import {BaseCommand} from './../base.js';
import {NodeCommandTasks} from './tasks.js';
import * as NodeFlags from './flags.js';
import {NodeCommandHandlers} from './handlers.js';
import {autoInjectable} from "tsyringe-neo";
import {CommandWithHandlers} from "../../types/index.js";

/**
 * Defines the core functionalities of 'node' command
 */
@autoInjectable()
export class NodeCommand extends NodeCommandHandlers implements CommandWithHandlers {

  constructor() {
    super();
  }

  getCommandDefinition() {
    const self = this;
    return {
      command: 'node',
      desc: 'Manage Hedera platform node in solo network',
      builder: (yargs: any) => {
        return yargs
          .command(
            new YargsCommand(
              {
                command: 'setup',
                description: 'Setup node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'setup',
              },
              NodeFlags.SETUP_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'start',
                description: 'Start a node',
                commandDef: self,
                handler: 'start',
              },
              NodeFlags.START_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'stop',
                description: 'Stop a node',
                commandDef: self,
                handler: 'stop',
              },
              NodeFlags.STOP_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'keys',
                description: 'Generate node keys',
                commandDef: self,
                handler: 'keys',
              },
              NodeFlags.KEYS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'refresh',
                description: 'Reset and restart a node',
                commandDef: self,
                handler: 'refresh',
              },
              NodeFlags.REFRESH_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'logs',
                description:
                  'Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
                commandDef: self,
                handler: 'logs',
              },
              NodeFlags.LOGS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'states',
                description:
                  'Download hedera states from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
                commandDef: self,
                handler: 'states',
              },
              NodeFlags.STATES_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'add',
                description: 'Adds a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'add',
              },
              NodeFlags.ADD_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'add-prepare',
                description: 'Prepares the addition of a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'addPrepare',
              },
              NodeFlags.ADD_PREPARE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'add-submit-transactions',
                description: 'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
                commandDef: self,
                handler: 'addSubmitTransactions',
              },
              NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'add-execute',
                description: 'Executes the addition of a previously prepared node',
                commandDef: self,
                handler: 'addExecute',
              },
              NodeFlags.ADD_EXECUTE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'update',
                description: 'Update a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'update',
              },
              NodeFlags.UPDATE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'update-prepare',
                description: 'Prepare the deployment to update a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'updatePrepare',
              },
              NodeFlags.UPDATE_PREPARE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'update-submit-transactions',
                description: 'Submit transactions for updating a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'updateSubmitTransactions',
              },
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'update-execute',
                description: 'Executes the updating of a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'updateExecute',
              },
              NodeFlags.UPDATE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'delete',
                description: 'Delete a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'delete',
              },
              NodeFlags.DELETE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'delete-prepare',
                description: 'Prepares the deletion of a node with a specific version of Hedera platform',
                commandDef: self,
                handler: 'deletePrepare',
              },
              NodeFlags.DELETE_PREPARE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'delete-submit-transactions',
                description: 'Submits transactions to the network nodes for deleting a node',
                commandDef: self,
                handler: 'deleteSubmitTransactions',
              },
              NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'delete-execute',
                description: 'Executes the deletion of a previously prepared node',
                commandDef: self,
                handler: 'deleteExecute',
              },
              NodeFlags.DELETE_EXECUTE_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'prepare-upgrade',
                description: 'Prepare the network for a Freeze Upgrade operation',
                commandDef: self,
                handler: 'prepareUpgrade',
              },
              NodeFlags.DEFAULT_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'freeze-upgrade',
                description:
                  'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
                commandDef: self,
                handler: 'freezeUpgrade',
              },
              NodeFlags.DEFAULT_FLAGS,
            ),
          )

          .command(
            new YargsCommand(
              {
                command: 'download-generated-files',
                description: 'Downloads the generated files from an existing node',
                commandDef: self,
                handler: 'downloadGeneratedFiles',
              },
              NodeFlags.DEFAULT_FLAGS,
            ),
          )

          .demandCommand(1, 'Select a node command');
      },
    };
  }
}
