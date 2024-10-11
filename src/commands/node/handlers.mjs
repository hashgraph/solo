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

import * as helpers from '../../core/helpers.mjs'
import * as NodeFlags from './flags.mjs'
import {
  addConfigBuilder,
  deleteConfigBuilder,
  downloadGeneratedFilesConfigBuilder, keysConfigBuilder, logsConfigBuilder,
  prepareUpgradeConfigBuilder, refreshConfigBuilder, setupConfigBuilder, startConfigBuilder, stopConfigBuilder,
  updateConfigBuilder
} from './configs.mjs'
import { constants } from '../../core/index.mjs'
import { IllegalArgumentError } from '../../core/errors.mjs'
import * as flags from '../flags.mjs'

export class NodeCommandHandlers {
  /**
     * @param {{logger: Logger, tasks: NodeCommandTasks, accountManager: AccountManager, configManager: ConfigManager, parent: NodeCommand, k8: K8, keyManager: accountManager, platformInstaller: PlatformInstaller}} opts
     */
  constructor (opts) {
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required')
    if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required')
    if (!opts || !opts.tasks) throw new Error('An instance of NodeCommandTasks is required')
    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required')
    if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)

    this.logger = opts.logger
    this.tasks = opts.tasks
    this.accountManager = opts.accountManager
    this.configManager = opts.configManager
    this.k8 = opts.k8
    this.platformInstaller = opts.platformInstaller

    this.getConfig = opts.parent.getConfig.bind(opts.parent)
    this.prepareChartPath = opts.parent.prepareChartPath.bind(opts.parent)
  }

  /**
     * @returns {string}
     */
  static get ADD_CONTEXT_FILE () {
    return 'node-add.json'
  }

  /**
     * @returns {string}
     */
  static get DELETE_CONTEXT_FILE () {
    return 'node-delete.json'
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

  /** ******** Task Lists **********/

  deletePrepareTaskList (argv) {
    return [
      this.tasks.initialize(argv, deleteConfigBuilder.bind(this)),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount()
    ]
  }

  deleteSubmitTransactionsTaskList (argv) {
    return [
      this.tasks.sendNodeDeleteTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  deleteExecuteTaskList (argv) {
    return [
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('existingNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      {
        title: 'TODO find a place for this',
        task: (ctx, parentTask) => {
          // remove nodeAlias from existingNodeAliases
          ctx.config.allNodeAliases = ctx.config.existingNodeAliases.filter(nodeAlias => nodeAlias !== ctx.config.nodeAlias)
        }
      },
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Update chart to use new configMap'),
      this.tasks.killNodes(),
      this.tasks.sleep('Give time for pods to come up after being killed', 20000),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware(),
      this.tasks.setupNetworkNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate(),
      this.tasks.finalize()
    ]
  }

  addPrepareTasks (argv) {
    return [
      this.tasks.initialize(argv, addConfigBuilder.bind(this)),
      this.tasks.checkPVCsEnabled(),
      this.tasks.identifyExistingNodes(),
      this.tasks.determineNewNodeAccountNumber(),
      this.tasks.generateGossipKey(),
      this.tasks.generateGrpcTlsKey(),
      this.tasks.loadSigningKeyCertificate(),
      this.tasks.computeMTLSCertificateHash(),
      this.tasks.prepareGossipEndpoints(),
      this.tasks.prepareGrpcServiceEndpoints(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount()
    ]
  }

  addSubmitTransactionsTasks (argv) {
    return [
      this.tasks.sendNodeCreateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  addExecuteTasks (argv) {
    return [
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap('Deploy new network node'),
      this.tasks.killNodes(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.populateServiceMap(),
      this.tasks.fetchPlatformSoftware(),
      this.tasks.downloadLastState(),
      this.tasks.uploadStateToNewNode(),
      this.tasks.setupNetworkNodes('allNodeAliases'),
      this.tasks.startNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.stakeNewNode(),
      this.tasks.triggerStakeWeightCalculate(),
      this.tasks.finalize()
    ]
  }

  /** ******** Handlers **********/

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
    return true
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
    return true
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
    return true
  }

  async update (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.UPDATE_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, updateConfigBuilder.bind(this)),
      this.tasks.identifyExistingNodes(),
      this.tasks.prepareGossipEndpoints(),
      this.tasks.prepareGrpcServiceEndpoints(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
      this.tasks.sendNodeUpdateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.sendFreezeUpgradeTransaction(),
      this.tasks.prepareStagingDirectory('allNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      this.tasks.checkAllNodesAreFrozen('existingNodeAliases'),
      this.tasks.getNodeLogsAndConfigs(),
      this.tasks.updateChartWithConfigMap(
        'Update chart to use new configMap due to account number change',
        (ctx) => !ctx.config.newAccountNumber && !ctx.config.debugNodeAlias
      ),
      this.tasks.killNodesAndUpdateConfigMap(),
      this.tasks.checkNodePodsAreRunning(),
      this.tasks.fetchPlatformSoftware(),
      this.tasks.setupNetworkNodes('allNodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('allNodeAliases'),
      this.tasks.checkAllNodeProxiesAreActive(),
      this.tasks.triggerStakeWeightCalculate(),
      this.tasks.finalize()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in updating nodes')

    await action(argv, this)
    return true
  }

  async delete (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_FLAGS)
    const action = helpers.commandActionBuilder([
      ...this.deletePrepareTaskList(argv),
      ...this.deleteSubmitTransactionsTaskList(argv),
      ...this.deleteExecuteTaskList(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in deleting nodes')

    await action(argv, this)
    return true
  }

  async deletePrepare (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_PREPARE_FLAGS)
    const action = helpers.commandActionBuilder([
      ...this.deletePrepareTaskList(argv),
      this.tasks.saveContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, helpers.deleteSaveContextParser)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in preparing to delete a node')

    await action(argv, this)
    return true
  }

  async deleteSubmitTransactions (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, updateConfigBuilder.bind(this)),
      this.tasks.loadContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
      this.deleteSubmitTransactionsTaskList(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in deleting a node')

    await action(argv, this)
    return true
  }

  async deleteExecute (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.DELETE_EXECUTE_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, deleteConfigBuilder.bind(this)),
      this.tasks.loadContextData(argv, NodeCommandHandlers.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
      ...this.deleteExecuteTaskList(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in deleting a node')

    await action(argv, this)
    return true
  }

  async add (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_FLAGS)
    const action = helpers.commandActionBuilder([
      ...this.addPrepareTasks(argv),
      ...this.addSubmitTransactionsTasks(argv),
      ...this.addExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in adding node')

    await action(argv, this)
    return true
  }

  async addPrepare (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_PREPARE_FLAGS)
    const action = helpers.commandActionBuilder([
      ...this.addPrepareTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in preparing node')

    await action(argv, this)
    return true
  }

  async addSubmitTransactions (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, addConfigBuilder.bind(this)),
      this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
      ...this.addSubmitTransactionsTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, '`Error in submitting transactions to node')

    await action(argv, this)
    return true
  }

  async addExecute (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.ADD_EXECUTE_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, addConfigBuilder.bind(this)),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadContextData(argv, NodeCommandHandlers.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
      ...this.addExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in adding node')

    await action(argv, this)
    return true
  }

  async logs (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.LOGS_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, logsConfigBuilder.bind(this)),
      this.tasks.getNodeLogsAndConfigs()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in downloading log from nodes')

    await action(argv, this)
    return true
  }

  async refresh (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.REFRESH_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, refreshConfigBuilder.bind(this)),
      this.tasks.identifyNetworkPods(),
      this.tasks.dumpNetworkNodesSaveState(),
      this.tasks.fetchPlatformSoftware(),
      this.tasks.setupNetworkNodes('nodeAliases'),
      this.tasks.startNodes('nodeAliases'),
      this.tasks.checkAllNodesAreActive('nodeAliases'),
      this.tasks.checkNodeProxiesAreActive((ctx) => ctx.config.app !== '')
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in refreshing nodes')

    await action(argv, this)
    return true
  }

  async keys (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.KEYS_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, keysConfigBuilder.bind(this)),
      this.tasks.generateGossipKeys(),
      this.tasks.generateGrpcTlsKeys(),
      this.tasks.finalize()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error generating keys')

    await action(argv, this)
    return true
  }

  async stop (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.STOP_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, stopConfigBuilder.bind(this)),
      this.tasks.identifyNetworkPods(),
      this.tasks.stopNodes()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error stopping node')

    await action(argv, this)
    return true
  }

  async start (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.START_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, startConfigBuilder.bind(this)),
      this.tasks.identifyExistingNodes(),
      this.tasks.startNodes('nodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('nodeAliases'),
      this.tasks.checkNodeProxiesAreActive(false),
      this.tasks.addNodeStakes()
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error starting node')

    await action(argv, this)
    return true
  }

  async setup (argv) {
    argv = helpers.addFlagsToArgv(argv, NodeFlags.SETUP_FLAGS)
    const action = helpers.commandActionBuilder([
      this.tasks.initialize(argv, setupConfigBuilder.bind(this)),
      this.tasks.identifyNetworkPods(),
      this.tasks.fetchPlatformSoftware(),
      this.tasks.setupNetworkNodes('nodeAliases')
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    }, 'Error in setting up nodes')

    await action(argv, this)
    return true
  }
}
