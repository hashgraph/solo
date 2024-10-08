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
'use strict'
import { IllegalArgumentError } from '../../core/errors.mjs'
import { YargsCommand } from '../../core/index.mjs'
import { BaseCommand } from './../base.mjs'
import { NodeCommandTasks } from './tasks.mjs'
import * as NodeFlags from './flags.mjs'
import {NodeCommandHandlers} from "./handlers.mjs";

/**
 * Defines the core functionalities of 'node' command
 */
export class NodeCommand extends BaseCommand {
    /**
     * @param {{logger: SoloLogger, helm: Helm, k8: K8, chartManager: ChartManager, configManager: ConfigManager,
     * depManager: DependencyManager, keytoolDepManager: KeytoolDependencyManager, downloader: PackageDownloader,
     * platformInstaller: PlatformInstaller, keyManager: KeyManager, accountManager: AccountManager,
     * profileManager: ProfileManager}} opts
     */
    constructor (opts) {
        super(opts)

        if (!opts || !opts.downloader) throw new IllegalArgumentError('An instance of core/PackageDownloader is required', opts.downloader)
        if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)
        if (!opts || !opts.keyManager) throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager)
        if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
        if (!opts || !opts.keytoolDepManager) throw new IllegalArgumentError('An instance of KeytoolDependencyManager is required', opts.keytoolDepManager)
        if (!opts || !opts.profileManager) throw new IllegalArgumentError('An instance of ProfileManager is required', opts.profileManager)

        this.downloader = opts.downloader
        this.platformInstaller = opts.platformInstaller
        this.keyManager = opts.keyManager
        this.accountManager = opts.accountManager
        this.keytoolDepManager = opts.keytoolDepManager
        this.profileManager = opts.profileManager
        this._portForwards = []

        this.tasks = new NodeCommandTasks({
            accountManager: opts.accountManager,
            configManager: opts.configManager,
            logger: opts.logger,
            platformInstaller: opts.platformInstaller,
            k8: opts.k8,
            keyManager: opts.keyManager
        })

        this.handlers = new NodeCommandHandlers({
            accountManager: opts.accountManager,
            configManager: opts.configManager,
            logger: opts.logger,
            tasks: this.tasks
        })
    }

    /**
     * stops and closes the port forwards
     * @returns {Promise<void>}
     */
    async close () {
      this.accountManager.close()
      if (this._portForwards) {
        for (const srv of this._portForwards) {
          await this.k8.stopPortForward(srv)
        }
      }

      this._portForwards = []
    }

    // Command Definition
    /**
     * Return Yargs command definition for 'node' command
     * @returns {{command: string, desc: string, builder: Function}}
     */
    getCommandDefinition () {
        const nodeCmd = this
        return {
            command: 'node',
            desc: 'Manage Hedera platform node in solo network',
            builder: yargs => {
                return yargs
                    .command(new YargsCommand({
                        command: 'setup',
                        description: 'Setup node with a specific version of Hedera platform',
                        commandDef: nodeCmd,
                        handler: 'setup'
                    }, NodeFlags.SETUP_FLAGS))

                    .command(new YargsCommand({
                        command: 'start',
                        description: 'Start a node',
                        commandDef: nodeCmd,
                        handler: 'start'
                    }, NodeFlags.START_FLAGS))

                    .command(new YargsCommand({
                        command: 'stop',
                        description: 'Stop a node',
                        commandDef: nodeCmd,
                        handler: 'stop'
                    }, NodeFlags.STOP_FLAGS))

                    .command(new YargsCommand({
                        command: 'keys',
                        description: 'Generate node keys',
                        commandDef: nodeCmd,
                        handler: 'keys'
                    }, NodeFlags.KEYS_FLAGS))

                    .command(new YargsCommand({
                        command: 'refresh',
                        description: 'Reset and restart a node',
                        commandDef: nodeCmd,
                        handler: 'refresh'
                    }, NodeFlags.REFRESH_FLAGS))

                    .command(new YargsCommand({
                        command: 'logs',
                        description: 'Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
                        commandDef: nodeCmd,
                        handler: 'logs'
                    }, NodeFlags.LOGS_FLAGS))

                    .command(new YargsCommand({
                        command: 'add',
                        description: 'Adds a node with a specific version of Hedera platform',
                        commandDef: nodeCmd,
                        handler: 'add'
                    }, NodeFlags.ADD_FLAGS))

                    .command(new YargsCommand({
                        command: 'add-prepare',
                        description: 'Prepares the addition of a node with a specific version of Hedera platform',
                        commandDef: nodeCmd,
                        handler: 'addPrepare'
                    }, NodeFlags.ADD_PREPARE_FLAGS))

                    .command(new YargsCommand({
                        command: 'add-submit-transactions',
                        description: 'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
                        commandDef: nodeCmd,
                        handler: 'addSubmitTransactions'
                    }, NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS))

                    .command(new YargsCommand({
                        command: 'add-execute',
                        description: 'Executes the addition of a previously prepared node',
                        commandDef: nodeCmd,
                        handler: 'addExecute'
                    }, NodeFlags.ADD_EXECUTE_FLAGS))

                    .command(new YargsCommand({
                        command: 'update',
                        description: 'Update a node with a specific version of Hedera platform',
                        commandDef: nodeCmd,
                        handler: 'update'
                    }, NodeFlags.UPDATE_FLAGS))

                    .command(new YargsCommand({
                        command: 'delete',
                        description: 'Delete a node with a specific version of Hedera platform',
                        commandDef: nodeCmd,
                        handler: 'delete'
                    }, NodeFlags.DELETE_FLAGS))

                    .command(new YargsCommand({
                        command: 'delete-prepare',
                        description: 'Prepares the deletion of a node with a specific version of Hedera platform',
                        commandDef: nodeCmd,
                        handler: 'deletePrepare'
                    }, NodeFlags.DELETE_PREPARE_FLAGS))

                    .command(new YargsCommand({
                        command: 'delete-submit-transactions',
                        description: 'Submits transactions to the network nodes for deleting a node',
                        commandDef: nodeCmd,
                        handler: 'deleteSubmitTransactions'
                    }, NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS))

                    .command(new YargsCommand({
                        command: 'delete-execute',
                        description: 'Executes the deletion of a previously prepared node',
                        commandDef: nodeCmd,
                        handler: 'deleteExecute'
                    }, NodeFlags.DELETE_EXECUTE_FLAGS))

                    .command(new YargsCommand({
                        command: 'prepare-upgrade',
                        description: 'Prepare the network for a Freeze Upgrade operation',
                        commandDef: nodeCmd,
                        handler: 'prepareUpgrade'
                    }, NodeFlags.DEFAULT_FLAGS))

                    .command(new YargsCommand({
                        command: 'freeze-upgrade',
                        description: 'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
                        commandDef: nodeCmd,
                        handler: 'freezeUpgrade'
                    }, NodeFlags.DEFAULT_FLAGS))

                    .command(new YargsCommand({
                        command: 'download-generated-files',
                        description: 'Downloads the generated files from an existing node',
                        commandDef: nodeCmd,
                        handler: 'downloadGeneratedFiles'
                    }, NodeFlags.DEFAULT_FLAGS))

                    .demandCommand(1, 'Select a node command')
            }
        }
    }
}
