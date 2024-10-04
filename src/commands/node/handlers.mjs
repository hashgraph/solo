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

import * as helpers from "../../core/helpers.mjs";
import * as NodeFlags from "./flags.mjs";
import {downloadGeneratedFilesConfigBuilder, prepareUpgradeConfigBuilder} from "./configs.mjs";
import {constants} from "../../core/index.mjs";
import {IllegalArgumentError} from "../../core/errors.mjs";

export class NodeCommandHandlers {
    /**
     * @param {{logger: Logger, tasks: NodeCommandTasks, accountManager: AccountManager, configManager: ConfigManager}} opts
     */
    constructor (opts) {
        if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
        if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required')
        if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required')
        if (!opts || !opts.tasks) throw new Error('An instance of NodeCommandTasks is required')

        this.logger = opts.logger
        this.tasks = opts.tasks
    }

    async prepareUpgrade (argv) {
        argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS)
        const action = helpers.commandActionBuilder([
            this.tasks.initialize(argv, prepareUpgradeConfigBuilder.bind(this)),
            this.tasks.prepareUpgradeZip(),
            this.tasks.sendPrepareUpgradeTransaction()
        ], {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
        }, 'Error in preparing node upgrade')

        await action(argv, this)
    }

    async freezeUpgrade (argv) {
        argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS)
        const action = helpers.commandActionBuilder([
            this.tasks.initialize(argv, prepareUpgradeConfigBuilder.bind(this)),
            this.tasks.prepareUpgradeZip(),
            this.tasks.sendFreezeUpgradeTransaction()
        ], {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
        }, 'Error in executing node freeze upgrade')

        await action(argv, this)
    }

    async downloadGeneratedFiles (argv) {
        argv = helpers.addFlagsToArgv(argv, NodeFlags.DEFAULT_FLAGS)
        const action = helpers.commandActionBuilder([
            this.tasks.initialize(argv, downloadGeneratedFilesConfigBuilder.bind(this)),
            this.tasks.identifyExistingNodes(),
            this.tasks.downloadNodeGeneratedFiles()
        ], {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
        }, 'Error in downloading generated files')

        await action(argv, this)
    }
}
