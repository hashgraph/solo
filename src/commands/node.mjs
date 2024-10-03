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
import * as x509 from '@peculiar/x509'
import chalk from 'chalk'
import * as fs from 'fs'
import { Listr } from 'listr2'
import path from 'path'
import { SoloError, IllegalArgumentError } from '../core/errors.mjs'
import * as helpers from '../core/helpers.mjs'
import {
  addDebugOptions,
  getNodeAccountMap,
  getNodeLogs,
  renameAndCopyFile,
  sleep,
  validatePath
} from '../core/helpers.mjs'
import { constants, Templates, YargsCommand } from '../core/index.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as prompts from './prompts.mjs'

import {
  AccountBalanceQuery,
  AccountId,
  AccountUpdateTransaction,
  PrivateKey,
  NodeCreateTransaction,
  NodeUpdateTransaction,
  NodeDeleteTransaction,
  ServiceEndpoint
} from '@hashgraph/sdk'
import * as crypto from 'crypto'
import {
  DEFAULT_NETWORK_NODE_NAME,
  FREEZE_ADMIN_ACCOUNT,
  HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
  TREASURY_ACCOUNT_ID,
  LOCAL_HOST
} from '../core/constants.mjs'
import { NodeStatusCodes, NodeStatusEnums } from '../core/enumerations.mjs'
import { NodeCommandTasks } from './node/tasks.mjs'
import { downloadGeneratedFilesConfigBuilder, prepareUpgradeConfigBuilder } from './node/configs.mjs'
import * as NodeFlags from './node/flags.mjs'

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
      k8: opts.k8
    })
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
   * @returns {string}
   */
  static get SETUP_CONFIGS_NAME () {
    return 'setupConfigs'
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get SETUP_FLAGS_LIST () {
    return [
      flags.app,
      flags.appConfig,
      flags.cacheDir,
      flags.devMode,
      flags.localBuildPath,
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.releaseTag
    ]
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get START_FLAGS_LIST () {
    return [
      flags.app,
      flags.debugNodeAlias,
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.quiet
    ]
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get STOP_FLAGS_LIST () {
    return [
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.quiet
    ]
  }

  /**
   * @returns {string}
   */
  static get KEYS_CONFIGS_NAME () {
    return 'keysConfigs'
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get KEYS_FLAGS_LIST () {
    return [
      flags.cacheDir,
      flags.devMode,
      flags.generateGossipKeys,
      flags.generateTlsKeys,
      flags.nodeAliasesUnparsed,
      flags.quiet
    ]
  }

  /**
   * @returns {string}
   */
  static get REFRESH_CONFIGS_NAME () {
    return 'refreshConfigs'
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get REFRESH_FLAGS_LIST () {
    return [
      flags.app,
      flags.cacheDir,
      flags.devMode,
      flags.localBuildPath,
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.quiet,
      flags.releaseTag
    ]
  }

  /**
   * @returns {string}
   */
  static get ADD_CONFIGS_NAME () {
    return 'addConfigs'
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get COMMON_ADD_FLAGS_LIST () {
    return [
      flags.app,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.devMode,
      flags.debugNodeAlias,
      flags.endpointType,
      flags.fstChartVersion,
      flags.generateGossipKeys,
      flags.generateTlsKeys,
      flags.gossipEndpoints,
      flags.grpcEndpoints,
      flags.localBuildPath,
      flags.quiet,
      flags.namespace,
      flags.releaseTag
    ]
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get ADD_FLAGS_LIST () {
    const commonFlags = NodeCommand.COMMON_ADD_FLAGS_LIST
    return [
      ...commonFlags,
      flags.adminKey
    ]
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get ADD_PREPARE_FLAGS_LIST () {
    const commonFlags = NodeCommand.COMMON_ADD_FLAGS_LIST
    return [
      ...commonFlags,
      flags.adminKey,
      flags.outputDir
    ]
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get ADD_SUBMIT_TRANSACTIONS_FLAGS_LIST () {
    const commonFlags = NodeCommand.COMMON_ADD_FLAGS_LIST
    return [
      ...commonFlags,
      flags.inputDir
    ]
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get ADD_EXECUTE_FLAGS_LIST () {
    const commonFlags = NodeCommand.COMMON_ADD_FLAGS_LIST
    return [
      ...commonFlags,
      flags.inputDir
    ]
  }

  static get DELETE_CONFIGS_NAME () {
    return 'deleteConfigs'
  }

  static get DELETE_FLAGS_LIST () {
    return [
      ...NodeCommand.COMMON_DELETE_FLAGS_LIST
    ]
  }

  static get DELETE_PREPARE_FLAGS_LIST () {
    return [
      ...NodeCommand.COMMON_DELETE_FLAGS_LIST,
      flags.outputDir
    ]
  }

  static get DELETE_SUBMIT_TRANSACTIONS_FLAGS_LIST () {
    return [
      ...NodeCommand.COMMON_DELETE_FLAGS_LIST,
      flags.inputDir
    ]
  }

  static get DELETE_EXECUTE_FLAGS_LIST () {
    return [
      ...NodeCommand.COMMON_DELETE_FLAGS_LIST,
      flags.inputDir
    ]
  }

  /**
   * @returns {CommandFlag[]}
   */
  static get COMMON_DELETE_FLAGS_LIST () {
    return [
      flags.app,
      flags.cacheDir,
      flags.chartDirectory,
      flags.devMode,
      flags.debugNodeAlias,
      flags.endpointType,
      flags.localBuildPath,
      flags.namespace,
      flags.nodeAlias,
      flags.quiet,
      flags.releaseTag
    ]
  }

  static get UPDATE_CONFIGS_NAME () {
    return 'updateConfigs'
  }

  static get UPDATE_FLAGS_LIST () {
    return [
      flags.app,
      flags.cacheDir,
      flags.chartDirectory,
      flags.devMode,
      flags.debugNodeAlias,
      flags.endpointType,
      flags.fstChartVersion,
      flags.gossipEndpoints,
      flags.gossipPrivateKey,
      flags.gossipPublicKey,
      flags.grpcEndpoints,
      flags.localBuildPath,
      flags.namespace,
      flags.newAccountNumber,
      flags.newAdminKey,
      flags.nodeAlias,
      flags.quiet,
      flags.releaseTag,
      flags.tlsPrivateKey,
      flags.tlsPublicKey
    ]
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

  /**
   * @param {string} namespace
   * @param {string} accountId
   * @param {NodeAlias} nodeAlias
   * @returns {Promise<void>}
   */
  async addStake (namespace, accountId, nodeAlias) {
    try {
      await this.accountManager.loadNodeClient(namespace)
      const client = this.accountManager._nodeClient
      const treasuryKey = await this.accountManager.getTreasuryAccountKeys(namespace)
      const treasuryPrivateKey = PrivateKey.fromStringED25519(treasuryKey.privateKey)
      client.setOperator(TREASURY_ACCOUNT_ID, treasuryPrivateKey)

      // get some initial balance
      await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, HEDERA_NODE_DEFAULT_STAKE_AMOUNT + 1)

      // check balance
      const balance = await new AccountBalanceQuery()
        .setAccountId(accountId)
        .execute(client)
      this.logger.debug(`Account ${accountId} balance: ${balance.hbars}`)

      // Create the transaction
      const transaction = await new AccountUpdateTransaction()
        .setAccountId(accountId)
        .setStakedNodeId(Templates.nodeIdFromNodeAlias(nodeAlias) - 1)
        .freezeWith(client)

      // Sign the transaction with the account's private key
      const signTx = await transaction.sign(treasuryPrivateKey)

      // Submit the transaction to a Hedera network
      const txResponse = await signTx.execute(client)

      // Request the receipt of the transaction
      const receipt = await txResponse.getReceipt(client)

      // Get the transaction status
      const transactionStatus = receipt.status
      this.logger.debug(`The transaction consensus status is ${transactionStatus.toString()}`)
    } catch (e) {
      throw new SoloError(`Error in adding stake: ${e.message}`, e)
    }
  }

  /**
   * @param {string} namespace
   * @param {NodeAlias} nodeAlias
   * @param {TaskWrapper} task
   * @param {string} title
   * @param {number} index
   * @param {number} [status]
   * @param {number} [maxAttempts]
   * @param {number} [delay]
   * @param {number} [timeout]
   * @returns {Promise<string>}
   */
  async checkNetworkNodeActiveness (namespace, nodeAlias, task, title, index,
    status = NodeStatusCodes.ACTIVE, maxAttempts = 120, delay = 1_000, timeout = 1_000) {
    nodeAlias = nodeAlias.trim()
    const podName = Templates.renderNetworkPodName(nodeAlias)
    const podPort = 9_999
    const localPort = 19_000 + index
    task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt ${chalk.blueBright(`0/${maxAttempts}`)}`

    const srv = await this.k8.portForward(podName, localPort, podPort)

    let attempt = 0
    let success = false
    while (attempt < maxAttempts) {
      const controller = new AbortController()

      const timeoutId = setTimeout(() => {
        task.title = `${title} - status ${chalk.yellow('TIMEOUT')}, attempt ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`
        controller.abort()
      }, timeout)

      try {
        const url = `http://${LOCAL_HOST}:${localPort}/metrics`
        const response = await fetch(url, { signal: controller.signal })

        if (!response.ok) {
          task.title = `${title} - status ${chalk.yellow('UNKNOWN')}, attempt ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`
          clearTimeout(timeoutId)
          throw new Error() // Guard
        }

        const text = await response.text()
        const statusLine = text
          .split('\n')
          .find(line => line.startsWith('platform_PlatformStatus'))

        if (!statusLine) {
          task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`
          clearTimeout(timeoutId)
          throw new Error() // Guard
        }

        const statusNumber = parseInt(statusLine.split(' ').pop())

        if (statusNumber === status) {
          task.title = `${title} - status ${chalk.green(NodeStatusEnums[status])}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`
          success = true
          clearTimeout(timeoutId)
          break
        } else if (statusNumber === NodeStatusCodes.CATASTROPHIC_FAILURE) {
          task.title = `${title} - status ${chalk.red('CATASTROPHIC_FAILURE')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`
          break
        } else if (statusNumber) {
          task.title = `${title} - status ${chalk.yellow(NodeStatusEnums[statusNumber])}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`
        }
        clearTimeout(timeoutId)
      } catch {} // Catch all guard and fetch errors

      attempt++
      clearTimeout(timeoutId)
      await sleep(delay)
    }

    await this.k8.stopPortForward(srv)

    if (!success) {
      throw new SoloError(`node '${nodeAlias}' is not ${NodeStatusEnums[status]}` +
        `[ attempt = ${chalk.blueBright(`${attempt}/${maxAttempts}`)} ]`)
    }

    await sleep(1_500) // delaying prevents - gRPC service error

    return podName
  }

  /**
   * @param {Object} ctx
   * @param {TaskWrapper} task
   * @param {NodeAliases} nodeAliases
   * @param {number} [status]
   * @returns {Listr<any, any, any>}
   */
  checkNodeActivenessTask (ctx, task, nodeAliases, status = NodeStatusCodes.ACTIVE) {
    const { config: { namespace } } = ctx

    const subTasks = nodeAliases.map((nodeAlias, i) => {
      const reminder = ('debugNodeAlias' in ctx.config && ctx.config.debugNodeAlias === nodeAlias) ? 'Please attach JVM debugger now.' : ''
      const title = `Check network pod: ${chalk.yellow(nodeAlias)} ${chalk.red(reminder)}`

      const subTask = async (ctx, task) => {
        ctx.config.podNames[nodeAlias] = await this.checkNetworkNodeActiveness(namespace, nodeAlias, task, title, i, status)
      }

      return { title, task: subTask }
    })

    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {
        collapseSubtasks: false
      }
    })
  }

  /**
   * Return task for checking for all network node pods
   * @param {any} ctx
   * @param {TaskWrapper} task
   * @param {NodeAliases} nodeAliases
   * @returns {*}
   */
  checkPodRunningTask (ctx, task, nodeAliases) {
    const subTasks = []
    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check Node: ${chalk.yellow(nodeAlias)}`,
        task: async () =>
          await this.k8.waitForPods([constants.POD_PHASE_RUNNING], [
            'fullstack.hedera.com/type=network-node',
            `fullstack.hedera.com/node-name=${nodeAlias}`
          ], 1, 60 * 15, 1000) // timeout 15 minutes
      })
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: false, // no need to run concurrently since if one node is up, the rest should be up by then
      rendererOptions: {
        collapseSubtasks: false
      }
    })
  }

  /**
   * Return task for setup network nodes
   * @param {any} ctx
   * @param {TaskWrapper} task
   * @param {NodeAliases} nodeAliases
   * @returns {*}
   */
  setupNodesTask (ctx, task, nodeAliases) {
    const subTasks = []
    for (const nodeAlias of nodeAliases) {
      const podName = ctx.config.podNames[nodeAlias]
      subTasks.push({
        title: `Node: ${chalk.yellow(nodeAlias)}`,
        task: () =>
          this.platformInstaller.taskSetup(podName)
      })
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })
  }

  /**
   * Return task for start network node hedera service
   * @param {TaskWrapper} task
   * @param {string[]} podNames
   * @param {NodeAliases} nodeAliases
   * @returns {*}
   */
  startNetworkNodesTask (task, podNames, nodeAliases) {
    const subTasks = []
    // ctx.config.allNodeAliases = ctx.config.existingNodeAliases
    this.startNodes(podNames, nodeAliases, subTasks)

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {
        collapseSubtasks: false,
        timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
      }
    })
  }

  /**
   * Return task for check if node proxies are ready
   * @param {any} ctx
   * @param {TaskWrapper} task
   * @param {NodeAliases} nodeAliases
   * @returns {*}
   */
  checkNodesProxiesTask (ctx, task, nodeAliases) {
    const subTasks = []
    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check proxy for node: ${chalk.yellow(nodeAlias)}`,
        task: async () => await this.k8.waitForPodReady(
          [`app=haproxy-${nodeAlias}`, 'fullstack.hedera.com/type=haproxy'],
          1, 300, 2000)
      })
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: false,
      rendererOptions: {
        collapseSubtasks: false
      }
    })
  }

  /**
   * Task for repairing staging directory
   * @param ctx
   * @param task
   * @param keysDir
   * @param stagingKeysDir
   * @param {NodeAliases} nodeAliases
   * @return return task for reparing staging directory
   */
  prepareStagingTask (ctx, task, keysDir, stagingKeysDir, nodeAliases) {
    const subTasks = [
      {
        title: 'Copy Gossip keys to staging',
        task: async () => {
          // const config = /** @type {NodeDeleteConfigClass} **/ ctx.config

          await this.keyManager.copyGossipKeysToStaging(keysDir, stagingKeysDir, nodeAliases)
        }
      },
      {
        title: 'Copy gRPC TLS keys to staging',
        task: async () => {
          // const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
          for (const nodeAlias of nodeAliases) {
            const tlsKeyFiles = this.keyManager.prepareTLSKeyFilePaths(nodeAlias, keysDir)
            await this.keyManager.copyNodeKeysToStaging(tlsKeyFiles, stagingKeysDir)
          }
        }
      }
    ]
    return task.newListr(subTasks, {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })
  }

  /**
   * Return task for copy node key to staging directory
   * @param ctx
   * @param task
   */
  copyNodeKeyTask (ctx, task) {
    const subTasks = this.platformInstaller.copyNodeKeys(ctx.config.stagingDir, ctx.config.allNodeAliases)

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })
  }

  /**
   * Prepare parameter and update the network node chart
   * @param ctx
   */
  async chartUpdateTask (ctx) {
    const config = ctx.config

    if (!config.serviceMap) {
      config.serviceMap = await this.accountManager.getNodeServiceMap(config.namespace)
    }

    const index = config.existingNodeAliases.length
    const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias) - 1

    let valuesArg = ''
    for (let i = 0; i < index; i++) {
      if ((config.newAccountNumber && i !== nodeId) || !config.newAccountNumber) { // for the case of updating node
        valuesArg += ` --set "hedera.nodes[${i}].accountId=${config.serviceMap.get(config.existingNodeAliases[i]).accountId}" --set "hedera.nodes[${i}].name=${config.existingNodeAliases[i]}"`
      } else {
        // use new account number for this node id
        valuesArg += ` --set "hedera.nodes[${i}].accountId=${config.newAccountNumber}" --set "hedera.nodes[${i}].name=${config.existingNodeAliases[i]}"`
      }
    }

    // for the case of adding new node
    if (ctx.newNode && ctx.newNode.accountId) {
      valuesArg += ` --set "hedera.nodes[${index}].accountId=${ctx.newNode.accountId}" --set "hedera.nodes[${index}].name=${ctx.newNode.name}"`
    }
    this.profileValuesFile = await this.profileManager.prepareValuesForNodeAdd(
      path.join(config.stagingDir, 'config.txt'),
      path.join(config.stagingDir, 'templates', 'application.properties'))
    if (this.profileValuesFile) {
      valuesArg += this.prepareValuesFiles(this.profileValuesFile)
    }

    valuesArg = addDebugOptions(valuesArg, config.debugNodeAlias)

    await this.chartManager.upgrade(
      config.namespace,
      constants.FULLSTACK_DEPLOYMENT_CHART,
      config.chartPath,
      valuesArg,
      config.fstChartVersion
    )
  }

  /**
   * Update account manager and transfer hbar for staking purpose
   * @param config
   */
  async triggerStakeCalculation (config) {
    this.logger.info('sleep 60 seconds for the handler to be able to trigger the network node stake weight recalculate')
    await sleep(60000)
    const accountMap = getNodeAccountMap(config.allNodeAliases)

    if (config.newAccountNumber) {
      // update map with current account ids
      accountMap.set(config.nodeAlias, config.newAccountNumber)

      // update _nodeClient with the new service map since one of the account number has changed
      await this.accountManager.refreshNodeClient(config.namespace)
    }

    // send some write transactions to invoke the handler that will trigger the stake weight recalculate
    for (const nodeAlias of config.allNodeAliases) {
      const accountId = accountMap.get(nodeAlias)
      config.nodeClient.setOperator(TREASURY_ACCOUNT_ID, config.treasuryKey)
      await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, 1)
    }
  }

  async initializeSetup (config, k8) {
    // compute other config parameters
    config.keysDir = path.join(validatePath(config.cacheDir), 'keys')
    config.stagingDir = Templates.renderStagingDir(
      config.cacheDir,
      config.releaseTag
    )
    config.stagingKeysDir = path.join(validatePath(config.stagingDir), 'keys')

    if (!await k8.hasNamespace(config.namespace)) {
      throw new SoloError(`namespace ${config.namespace} does not exist`)
    }

    // prepare staging keys directory
    if (!fs.existsSync(config.stagingKeysDir)) {
      fs.mkdirSync(config.stagingKeysDir, { recursive: true })
    }

    // create cached keys dir if it does not exist yet
    if (!fs.existsSync(config.keysDir)) {
      fs.mkdirSync(config.keysDir)
    }
  }

  /**
   * @param {NodeAliases} nodeAliases
   * @param {Object} podNames
   * @param {TaskWrapper} task
   * @param {string} localBuildPath
   * @returns {Listr<*, *, *>}
   */
  uploadPlatformSoftware (nodeAliases, podNames, task, localBuildPath) {
    const self = this
    const subTasks = []

    self.logger.debug('no need to fetch, use local build jar files')

    /** @type {Map<NodeAlias, string>} */
    const buildPathMap = new Map()
    let defaultDataLibBuildPath
    const parameterPairs = localBuildPath.split(',')
    for (const parameterPair of parameterPairs) {
      if (parameterPair.includes('=')) {
        const [nodeAlias, localDataLibBuildPath] = parameterPair.split('=')
        buildPathMap.set(nodeAlias, localDataLibBuildPath)
      } else {
        defaultDataLibBuildPath = parameterPair
      }
    }

    let localDataLibBuildPath
    for (const nodeAlias of nodeAliases) {
      const podName = podNames[nodeAlias]
      if (buildPathMap.has(nodeAlias)) {
        localDataLibBuildPath = buildPathMap.get(nodeAlias)
      } else {
        localDataLibBuildPath = defaultDataLibBuildPath
      }

      if (!fs.existsSync(localDataLibBuildPath)) {
        throw new SoloError(`local build path does not exist: ${localDataLibBuildPath}`)
      }

      subTasks.push({
        title: `Copy local build to Node: ${chalk.yellow(nodeAlias)} from ${localDataLibBuildPath}`,
        task: async () => {
          this.logger.debug(`Copying build files to pod: ${podName} from ${localDataLibBuildPath}`)
          await self.k8.copyTo(podName, constants.ROOT_CONTAINER, localDataLibBuildPath, `${constants.HEDERA_HAPI_PATH}`)
          const testJsonFiles = self.configManager.getFlag(flags.appConfig).split(',')
          for (const jsonFile of testJsonFiles) {
            if (fs.existsSync(jsonFile)) {
              await self.k8.copyTo(podName, constants.ROOT_CONTAINER, jsonFile, `${constants.HEDERA_HAPI_PATH}`)
            }
          }
        }
      })
    }
    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })
  }

  /**
   * @param {NodeAliases} nodeAliases
   * @param {Object} podNames
   * @param {string} releaseTag
   * @param {TaskWrapper} task
   * @param {string} localBuildPath
   * @returns {Listr<*, *, *>}
   */
  fetchLocalOrReleasedPlatformSoftware (nodeAliases, podNames, releaseTag, task, localBuildPath) {
    const self = this
    if (localBuildPath !== '') {
      return self.uploadPlatformSoftware(nodeAliases, podNames, task, localBuildPath)
    } else {
      return self.fetchPlatformSoftware(nodeAliases, podNames, releaseTag, task, self.platformInstaller)
    }
  }

  /**
   * @param {NodeAliases} nodeAliases
   * @param {Object} podNames
   * @param {string} releaseTag
   * @param {TaskWrapper} task
   * @param {PlatformInstaller} platformInstaller
   * @returns {Listr<any, any, any>}
   */
  fetchPlatformSoftware (nodeAliases, podNames, releaseTag, task, platformInstaller) {
    const subTasks = []
    for (const nodeAlias of nodeAliases) {
      const podName = podNames[nodeAlias]
      subTasks.push({
        title: `Update node: ${chalk.yellow(nodeAlias)} [ platformVersion = ${releaseTag} ]`,
        task: async () =>
          await platformInstaller.fetchPlatform(podName, releaseTag)
      })
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true, // since we download in the container directly, we want this to be in parallel across all nodes
      rendererOptions: {
        collapseSubtasks: false
      }
    })
  }

  async loadPermCertificate (certFullPath) {
    const certPem = fs.readFileSync(certFullPath).toString()
    const decodedDers = x509.PemConverter.decode(certPem)
    if (!decodedDers || decodedDers.length === 0) {
      throw new SoloError('unable to load perm key: ' + certFullPath)
    }
    return (new Uint8Array(decodedDers[0]))
  }

  /**
   * @param {string} endpointType
   * @param {string[]} endpoints
   * @param {number} defaultPort
   * @returns {ServiceEndpoint[]}
   */
  prepareEndpoints (endpointType, endpoints, defaultPort) {
    const ret = /** @typedef ServiceEndpoint **/[]
    for (const endpoint of endpoints) {
      const parts = endpoint.split(':')

      let url = ''
      let port = defaultPort

      if (parts.length === 2) {
        url = parts[0].trim()
        port = parts[1].trim()
      } else if (parts.length === 1) {
        url = parts[0]
      } else {
        throw new SoloError(`incorrect endpoint format. expected url:port, found ${endpoint}`)
      }

      if (endpointType.toUpperCase() === constants.ENDPOINT_TYPE_IP) {
        ret.push(new ServiceEndpoint({
          port,
          ipAddressV4: helpers.parseIpAddressToUint8Array(url)
        }))
      } else {
        ret.push(new ServiceEndpoint({
          port,
          domainName: url
        }))
      }
    }

    return ret
  }

  // List of Commands
  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async setup (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.app,
            flags.appConfig,
            flags.devMode,
            flags.localBuildPath
          ])

          await prompts.execute(task, self.configManager, NodeCommand.SETUP_FLAGS_LIST)

          /**
           * @typedef {Object} NodeSetupConfigClass
           * -- flags --
           * @property {string} app
           * @property {string} appConfig
           * @property {string} cacheDir
           * @property {boolean} devMode
           * @property {string} localBuildPath
           * @property {string} namespace
           * @property {string} nodeAliasesUnparsed
           * @property {string} releaseTag
           * -- extra args --
           * @property {NodeAliases} nodeAliases
           * @property {Object} podNames
           * -- methods --
           * @property {getUnusedConfigs} getUnusedConfigs
           */
          /**
           * @callback getUnusedConfigs
           * @returns {string[]}
           */

          // create a config object for subsequent steps
          const config = /** @type {NodeSetupConfigClass} **/ this.getConfig(NodeCommand.SETUP_CONFIGS_NAME, NodeCommand.SETUP_FLAGS_LIST,
            [
              'nodeAliases',
              'podNames'
            ])

          config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed)

          await self.initializeSetup(config, self.k8)

          // set config in the context for later tasks to use
          ctx.config = config

          self.logger.debug('Initialized config', { config })
        }
      },
      this.tasks.identifyNetworkPods(),
      {
        title: 'Fetch platform software into network nodes',
        task:
          async (ctx, task) => {
            const config = /** @type {NodeSetupConfigClass} **/ ctx.config
            return self.fetchLocalOrReleasedPlatformSoftware(config.nodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
          }
      },
      {
        title: 'Setup network nodes',
        task: async (ctx, parentTask) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.nodeAliases)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new SoloError(`Error in setting up nodes: ${e.message}`, e)
    }

    return true
  }

  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async start (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          await prompts.execute(task, self.configManager, [
            flags.namespace,
            flags.nodeAliasesUnparsed
          ])

          ctx.config = {
            app: self.configManager.getFlag(flags.app),
            cacheDir: self.configManager.getFlag(flags.cacheDir),
            debugNodeAlias: self.configManager.getFlag(flags.debugNodeAlias),
            namespace: self.configManager.getFlag(flags.namespace),
            nodeAliases: helpers.parseNodeAliases(self.configManager.getFlag(flags.nodeAliasesUnparsed))
          }

          ctx.config.stagingDir = Templates.renderStagingDir(
            self.configManager.getFlag(flags.cacheDir),
            self.configManager.getFlag(flags.releaseTag)
          )

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new SoloError(`namespace ${ctx.config.namespace} does not exist`)
          }
        }
      },
      this.tasks.identifyExistingNodes(),
      {
        title: 'Starting nodes',
        task: (ctx, task) => {
          return this.startNetworkNodesTask(task, ctx.config.podNames, ctx.config.nodeAliases)
        }
      },
      {
        title: 'Enable port forwarding for JVM debugger',
        task: async (ctx) => {
          await this.enableJVMPortForwarding(ctx.config.debugNodeAlias)
        },
        skip: (ctx) => !ctx.config.debugNodeAlias
      },
      {
        title: 'Check nodes are ACTIVE',
        task: (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.nodeAliases)
        }
      },
      {
        title: 'Check node proxies are ACTIVE',
        task: async (ctx, parentTask) => {
          return self.checkNodesProxiesTask(ctx, parentTask, ctx.config.nodeAliases)
        },
        skip: () => self.configManager.getFlag(flags.app) !== '' && self.configManager.getFlag(flags.app) !== constants.HEDERA_APP_NAME
      },
      {
        title: 'Add node stakes',
        task: (ctx, task) => {
          if (ctx.config.app === '' || ctx.config.app === constants.HEDERA_APP_NAME) {
            const subTasks = []
            const accountMap = getNodeAccountMap(ctx.config.nodeAliases)
            for (const nodeAlias of ctx.config.nodeAliases) {
              const accountId = accountMap.get(nodeAlias)
              subTasks.push({
                title: `Adding stake for node: ${chalk.yellow(nodeAlias)}`,
                task: async () => await self.addStake(ctx.config.namespace, accountId, nodeAlias)
              })
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: false,
              rendererOptions: {
                collapseSubtasks: false
              }
            })
          }
        }
      }], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
      self.logger.debug('node start has completed')
    } catch (e) {
      throw new SoloError(`Error starting node: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async stop (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace,
            flags.nodeAliasesUnparsed
          ])

          /** @type {{namespace: string, nodeAliases: NodeAliases}} */
          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            nodeAliases: helpers.parseNodeAliases(self.configManager.getFlag(flags.nodeAliasesUnparsed))
          }

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new SoloError(`namespace ${ctx.config.namespace} does not exist`)
          }
        }
      },
      this.tasks.identifyNetworkPods(),
      {
        title: 'Stopping nodes',
        task: (ctx, task) => {
          const subTasks = []
          for (const nodeAlias of ctx.config.nodeAliases) {
            const podName = ctx.config.podNames[nodeAlias]
            subTasks.push({
              title: `Stop node: ${chalk.yellow(nodeAlias)}`,
              task: async () => await self.k8.execContainer(podName, constants.ROOT_CONTAINER, 'systemctl stop network-node')
            })
          }

          // setup the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new SoloError('Error stopping node', e)
    }

    return true
  }

  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async keys (argv) {
    const self = this
    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.devMode
          ])

          await prompts.execute(task, self.configManager, NodeCommand.KEYS_FLAGS_LIST)

          /**
           * @typedef {Object} NodeKeysConfigClass
           * -- flags --
           * @property {string} cacheDir
           * @property {boolean} devMode
           * @property {boolean} generateGossipKeys
           * @property {boolean} generateTlsKeys
           * @property {string} nodeAliasesUnparsed
           * -- extra args --
           * @property {Date} curDate
           * @property {string} keysDir
           * @property {NodeAliases} nodeAliases
           * -- methods --
           * @property {getUnusedConfigs} getUnusedConfigs
           */
          /**
           * @callback getUnusedConfigs
           * @returns {string[]}
           */

          // create a config object for subsequent steps
          const config = /** @type {NodeKeysConfigClass} **/ this.getConfig(NodeCommand.KEYS_CONFIGS_NAME, NodeCommand.KEYS_FLAGS_LIST,
            [
              'curDate',
              'keysDir',
              'nodeAliases'
            ])

          config.curDate = new Date()
          config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed)
          config.keysDir = path.join(self.configManager.getFlag(flags.cacheDir), 'keys')

          if (!fs.existsSync(config.keysDir)) {
            fs.mkdirSync(config.keysDir)
          }

          ctx.config = config
        }
      },
      {
        title: 'Generate gossip keys',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self.keyManager.taskGenerateGossipKeys(self.keytoolDepManager, config.nodeAliases, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS keys',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self.keyManager.taskGenerateTLSKeys(config.nodeAliases, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx) => !ctx.config.generateTlsKeys
      },
      {
        title: 'Finalize',
        task: () => {
          // reset flags so that keys are not regenerated later
          self.configManager.setFlag(flags.generateGossipKeys, false)
          self.configManager.setFlag(flags.generateTlsKeys, false)
          self.configManager.persist()
        }
      }
    ])

    try {
      await tasks.run()
    } catch (e) {
      throw new SoloError(`Error generating keys: ${e.message}`, e)
    }

    return true
  }

  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async refresh (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.app,
            flags.devMode,
            flags.localBuildPath
          ])

          await prompts.execute(task, self.configManager, NodeCommand.REFRESH_FLAGS_LIST)

          /**
           * @typedef {Object} NodeRefreshConfigClass
           * -- flags --
           * @property {string} app
           * @property {string} cacheDir
           * @property {boolean} devMode
           * @property {string} localBuildPath
           * @property {string} namespace
           * @property {string} nodeAliasesUnparsed
           * @property {string} releaseTag
           * -- extra args --
           * @property {NodeAliases} nodeAliases
           * @property {Object} podNames
           * -- methods --
           * @property {getUnusedConfigs} getUnusedConfigs
           */
          /**
           * @callback getUnusedConfigs
           * @returns {string[]}
           */

          // create a config object for subsequent steps
          ctx.config = /** @type {NodeRefreshConfigClass} **/ this.getConfig(NodeCommand.REFRESH_CONFIGS_NAME, NodeCommand.REFRESH_FLAGS_LIST,
            [
              'nodeAliases',
              'podNames'
            ])

          ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed)

          await self.initializeSetup(ctx.config, self.k8)

          self.logger.debug('Initialized config', ctx.config)
        }
      },
      this.tasks.identifyNetworkPods(),
      {
        title: 'Dump network nodes saved state',
        task:
          async (ctx, task) => {
            const config = /** @type {NodeRefreshConfigClass} **/ ctx.config
            const subTasks = []
            for (const nodeAlias of config.nodeAliases) {
              const podName = config.podNames[nodeAlias]
              subTasks.push({
                title: `Node: ${chalk.yellow(nodeAlias)}`,
                task: async () =>
                  await self.k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -rf ${constants.HEDERA_HAPI_PATH}/data/saved/*`])
              })
            }

            // set up the sub-tasks
            return task.newListr(subTasks, {
              concurrent: true,
              rendererOptions: {
                collapseSubtasks: false
              }
            })
          }
      },
      {
        title: 'Fetch platform software into network nodes',
        task:
          async (ctx, task) => {
            const config = /** @type {NodeRefreshConfigClass} **/ ctx.config
            return self.fetchLocalOrReleasedPlatformSoftware(config.nodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
          }
      },
      {
        title: 'Setup network nodes',
        task: async (ctx, parentTask) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.nodeAliases)
        }
      },
      {
        title: 'Starting nodes',
        task: (ctx, task) => {
          return this.startNetworkNodesTask(task, ctx.config.podNames, ctx.config.nodeAliases)
        }
      },
      {
        title: 'Check nodes are ACTIVE',
        task: (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.nodeAliases)
        }
      },
      {
        title: 'Check node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: async (ctx, task) => {
          return this.checkNodesProxiesTask(ctx, task, ctx.config.nodeAliases)
        },
        skip: (ctx) => ctx.config.app !== ''
      }], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new SoloError(`Error in refreshing nodes: ${e.message}`, e)
    }

    return true
  }

  /**
   * @param {Object} argv
   * @returns {Promise<boolean>}
   */
  async logs (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          await prompts.execute(task, self.configManager, [
            flags.nodeAliasesUnparsed
          ])

          /** @type {{namespace: string, nodeAliases: NodeAliases}} */
          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            nodeAliases: helpers.parseNodeAliases(self.configManager.getFlag(flags.nodeAliasesUnparsed))
          }
          self.logger.debug('Initialized config', { config: ctx.config })
        }
      },
      {
        title: 'Copy logs from all nodes',
        task: (ctx) => {
          getNodeLogs(this.k8, ctx.config.namespace)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new SoloError(`Error in downloading log from nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  addInitializeTask (argv) {
    const self = this

    return {
      title: 'Initialize',
      task: async (ctx, task) => {
        self.configManager.update(argv)

        // disable the prompts that we don't want to prompt the user for
        prompts.disablePrompts([
          flags.adminKey,
          flags.app,
          flags.chainId,
          flags.chartDirectory,
          flags.outputDir,
          flags.devMode,
          flags.debugNodeAlias,
          flags.endpointType,
          flags.force,
          flags.fstChartVersion,
          flags.localBuildPath,
          flags.gossipEndpoints,
          flags.grpcEndpoints
        ])

        await prompts.execute(task, self.configManager, NodeCommand.ADD_FLAGS_LIST)

        /**
           * @typedef {Object} NodeAddConfigClass
           * -- flags --
           * @property {string} app
           * @property {string} cacheDir
           * @property {string} chainId
           * @property {string} chartDirectory
           * @property {boolean} devMode
           * @property {string} debugNodeAlias
           * @property {string} endpointType
           * @property {string} fstChartVersion
           * @property {boolean} generateGossipKeys
           * @property {boolean} generateTlsKeys
           * @property {string} gossipEndpoints
           * @property {string} grpcEndpoints
           * @property {string} localBuildPath
           * @property {string} namespace
           * @property {NodeAlias} nodeAlias
           * @property {string} releaseTag
           * -- extra args --
           * @property {PrivateKey} adminKey
           * @property {NodeAliases} allNodeAliases
           * @property {string} chartPath
           * @property {Date} curDate
           * @property {NodeAliases} existingNodeAliases
           * @property {string} freezeAdminPrivateKey
           * @property {string} keysDir
           * @property {string} lastStateZipPath
           * @property {Object} nodeClient
           * @property {Object} podNames
           * @property {Map<String, NetworkNodeServices>} serviceMap
           * @property {PrivateKey} treasuryKey
           * @property {string} stagingDir
           * @property {string} stagingKeysDir
           * -- methods --
           * @property {getUnusedConfigs} getUnusedConfigs
           */
        /**
           * @callback getUnusedConfigs
           * @returns {string[]}
           */

        // create a config object for subsequent steps
        const config = /** @type {NodeAddConfigClass} **/ this.getConfig(NodeCommand.ADD_CONFIGS_NAME, NodeCommand.ADD_FLAGS_LIST,
          [
            'allNodeAliases',
            'chartPath',
            'curDate',
            'existingNodeAliases',
            'freezeAdminPrivateKey',
            'keysDir',
            'lastStateZipPath',
            'nodeClient',
            'podNames',
            'serviceMap',
            'stagingDir',
            'stagingKeysDir',
            'treasuryKey'
          ])

        ctx.adminKey = argv[flags.adminKey.name] ? PrivateKey.fromStringED25519(argv[flags.adminKey.name]) : PrivateKey.fromStringED25519(constants.GENESIS_KEY)
        config.curDate = new Date()
        config.existingNodeAliases = []

        if (config.keyFormat !== constants.KEY_FORMAT_PEM) {
          throw new SoloError('key type cannot be PFX')
        }

        await self.initializeSetup(config, self.k8)

        // set config in the context for later tasks to use
        ctx.config = config

        ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDirectory,
          constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

        // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
        ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace)

        const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace)
        config.freezeAdminPrivateKey = accountKeys.privateKey

        const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace)
        const treasuryAccountPrivateKey = treasuryAccount.privateKey
        config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey)

        config.serviceMap = await self.accountManager.getNodeServiceMap(
          config.namespace)

        self.logger.debug('Initialized config', { config })
      }
    }
  }

  getAddPrepareTasks (argv) {
    const self = this

    return [
      self.addInitializeTask(argv),
      {
        title: 'Check that PVCs are enabled',
        task: async () => {
          if (!self.configManager.getFlag(flags.persistentVolumeClaims)) {
            throw new SoloError('PVCs are not enabled. Please enable PVCs before adding a node')
          }
        }
      },
      this.tasks.identifyExistingNodes(),
      {
        title: 'Determine new node account number',
        task: (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const values = { hedera: { nodes: [] } }
          let maxNum = 0

          let lastNodeAlias = DEFAULT_NETWORK_NODE_NAME

          for (/** @type {NetworkNodeServices} **/ const networkNodeServices of config.serviceMap.values()) {
            values.hedera.nodes.push({
              accountId: networkNodeServices.accountId,
              name: networkNodeServices.nodeAlias
            })
            maxNum = maxNum > AccountId.fromString(networkNodeServices.accountId).num
              ? maxNum
              : AccountId.fromString(networkNodeServices.accountId).num
            lastNodeAlias = networkNodeServices.nodeAlias
          }

          const lastNodeIdMatch = lastNodeAlias.match(/\d+$/)
          if (lastNodeIdMatch.length) {
            const incremented = parseInt(lastNodeIdMatch[0]) + 1
            lastNodeAlias = lastNodeAlias.replace(/\d+$/, incremented.toString())
          }

          ctx.maxNum = maxNum
          ctx.newNode = {
            accountId: `${constants.HEDERA_NODE_ACCOUNT_ID_START.realm}.${constants.HEDERA_NODE_ACCOUNT_ID_START.shard}.${++maxNum}`,
            name: lastNodeAlias
          }
          config.nodeAlias = lastNodeAlias
          config.allNodeAliases.push(lastNodeAlias)
        }
      },
      {
        title: 'Generate Gossip key',
        task: async (ctx, parentTask) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const subTasks = self.keyManager.taskGenerateGossipKeys(self.keytoolDepManager, [config.nodeAlias], config.keysDir, config.curDate, config.allNodeAliases) // 666
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS key',
        task: async (ctx, parentTask) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const subTasks = self.keyManager.taskGenerateTLSKeys([config.nodeAlias], config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx) => !ctx.config.generateTlsKeys
      },
      {
        title: 'Load signing key certificate',
        task: async (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const signingCertFile = Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, config.nodeAlias)
          const signingCertFullPath = path.join(config.keysDir, signingCertFile)
          ctx.signingCertDer = await this.loadPermCertificate(signingCertFullPath)
        }
      },
      {
        title: 'Compute mTLS certificate hash',
        task: async (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const tlsCertFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias)
          const tlsCertFullPath = path.join(config.keysDir, tlsCertFile)
          const tlsCertDer = await this.loadPermCertificate(tlsCertFullPath)
          ctx.tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest()
        }
      },
      {
        title: 'Prepare gossip endpoints',
        task: (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          let endpoints = []
          if (!config.gossipEndpoints) {
            if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
              throw new SoloError(`--gossip-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`)
            }

            endpoints = [
              `${Templates.renderFullyQualifiedNetworkPodName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT}`,
              `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`
            ]
          } else {
            endpoints = helpers.splitFlagInput(config.gossipEndpoints)
          }

          ctx.gossipEndpoints = helpers.prepareEndpoints(config.endpointType, endpoints, constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT)
        }
      },
      {
        title: 'Prepare grpc service endpoints',
        task: (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          let endpoints = []

          if (!config.grpcEndpoints) {
            if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
              throw new SoloError(`--grpc-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`)
            }

            endpoints = [
              `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`
            ]
          } else {
            endpoints = helpers.splitFlagInput(config.grpcEndpoints)
          }

          ctx.grpcServiceEndpoints = helpers.prepareEndpoints(config.endpointType, endpoints, constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT)
        }
      },
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount()
    ]
  }

  saveContextDataTask (argv, targetFile, parser) {
    return {
      title: 'Save context data',
      task: async (ctx, task) => {
        const outputDir = argv[flags.outputDir.name]
        if (!outputDir) {
          throw new SoloError(`Path to export context data not specified. Please set a value for --${flags.outputDir.name}`)
        }

        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true })
        }
        const exportedCtx = parser(ctx)
        fs.writeFileSync(path.join(outputDir, targetFile), JSON.stringify(exportedCtx))
      }
    }
  }

  loadContextDataTask (argv, targetFile, parser) {
    return {
      title: 'Load context data',
      task: async (ctx, task) => {
        const inputDir = argv[flags.inputDir.name]
        if (!inputDir) {
          throw new SoloError(`Path to context data not specified. Please set a value for --${flags.inputDir.name}`)
        }
        const ctxData = JSON.parse(fs.readFileSync(path.join(inputDir, targetFile)))
        parser(ctx, ctxData)
      }
    }
  }

  getAddTransactionTasks (argv) {
    return [
      {
        title: 'Send node create transaction',
        task: async (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config

          try {
            const nodeCreateTx = await new NodeCreateTransaction()
              .setAccountId(ctx.newNode.accountId)
              .setGossipEndpoints(ctx.gossipEndpoints)
              .setServiceEndpoints(ctx.grpcServiceEndpoints)
              .setGossipCaCertificate(ctx.signingCertDer)
              .setCertificateHash(ctx.tlsCertHash)
              .setAdminKey(ctx.adminKey.publicKey)
              .freezeWith(config.nodeClient)
            const signedTx = await nodeCreateTx.sign(ctx.adminKey)
            const txResp = await signedTx.execute(config.nodeClient)
            const nodeCreateReceipt = await txResp.getReceipt(config.nodeClient)
            this.logger.debug(`NodeCreateReceipt: ${nodeCreateReceipt.toString()}`)
          } catch (e) {
            this.logger.error(`Error adding node to network: ${e.message}`, e)
            throw new SoloError(`Error adding node to network: ${e.message}`, e)
          }
        }
      },
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  getAddExecuteTasks (argv) {
    const self = this

    return [
      this.tasks.downloadNodeGeneratedFiles(),
      {
        title: 'Prepare staging directory',
        task: async (ctx, parentTask) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          return this.prepareStagingTask(ctx, parentTask, config.keysDir, config.stagingKeysDir, config.allNodeAliases)
        }
      },
      {
        title: 'Copy node keys to secrets',
        task: async (ctx, parentTask) => {
          return this.copyNodeKeyTask(ctx, parentTask)
        }
      },
      {
        title: 'Check network nodes are frozen',
        task: (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.existingNodeAliases, NodeStatusCodes.FREEZE_COMPLETE)
        }
      },
      {
        title: 'Get node logs and configs',
        task: async (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          await helpers.getNodeLogs(self.k8, config.namespace)
        }
      },
      {
        title: 'Deploy new network node',
        task: async (ctx) => {
          await this.chartUpdateTask(ctx)
        }
      },
      {
        title: 'Kill nodes to pick up updated configMaps',
        task: async (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          for (const /** @type {NetworkNodeServices} **/ service of config.serviceMap.values()) {
            await self.k8.kubeClient.deleteNamespacedPod(service.nodePodName, config.namespace, undefined, undefined, 1)
          }
        }
      },
      {
        title: 'Check node pods are running',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          return this.checkPodRunningTask(ctx, task, config.allNodeAliases)
        }
      },
      {
        title: 'Fetch platform software into all network nodes',
        task:
          async (ctx, task) => {
            const config = /** @type {NodeAddConfigClass} **/ ctx.config
            config.serviceMap = await self.accountManager.getNodeServiceMap(
              config.namespace)
            config.podNames[config.nodeAlias] = config.serviceMap.get(config.nodeAlias).nodePodName

            return self.fetchLocalOrReleasedPlatformSoftware(config.allNodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
          }
      },
      {
        title: 'Download last state from an existing node',
        task: async (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeAliases[0])
          const upgradeDirectory = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/0/123`
          // zip the contents of the newest folder on node1 within /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/
          const zipFileName = await self.k8.execContainer(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `cd ${upgradeDirectory} && mapfile -t states < <(ls -1t .) && jar cf "\${states[0]}.zip" -C "\${states[0]}" . && echo -n \${states[0]}.zip`])
          await self.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${upgradeDirectory}/${zipFileName}`, config.stagingDir)
          config.lastStateZipPath = path.join(config.stagingDir, zipFileName)
        }
      },
      {
        title: 'Upload last saved state to new network node',
        task:
            async (ctx) => {
              const config = /** @type {NodeAddConfigClass} **/ ctx.config
              const newNodeFullyQualifiedPodName = Templates.renderNetworkPodName(config.nodeAlias)
              const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias)
              const savedStateDir = (config.lastStateZipPath.match(/\/(\d+)\.zip$/))[1]
              const savedStatePath = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/${nodeId}/123/${savedStateDir}`
              await self.k8.execContainer(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `mkdir -p ${savedStatePath}`])
              await self.k8.copyTo(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, config.lastStateZipPath, savedStatePath)
              await self.platformInstaller.setPathPermission(newNodeFullyQualifiedPodName, constants.HEDERA_HAPI_PATH)
              await self.k8.execContainer(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `cd ${savedStatePath} && jar xf ${path.basename(config.lastStateZipPath)} && rm -f ${path.basename(config.lastStateZipPath)}`])
            }
      },
      {
        title: 'Setup new network node',
        task: async (ctx, parentTask) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Start network nodes',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          return this.startNetworkNodesTask(task, config.podNames, config.allNodeAliases)
        }
      },
      {
        title: 'Enable port forwarding for JVM debugger',
        task: async (ctx) => {
          await this.enableJVMPortForwarding(ctx.config.debugNodeAlias)
        },
        skip: (ctx) => !ctx.config.debugNodeAlias
      },
      {
        title: 'Check all nodes are ACTIVE',
        task: async (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Check all node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: async (ctx, task) => {
          return this.checkNodesProxiesTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Stake new node',
        task: async (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          await self.addStake(config.namespace, ctx.newNode.accountId, config.nodeAlias)
        }
      },
      {
        title: 'Trigger stake weight calculate',
        task: async (ctx) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          await this.triggerStakeCalculation(config)
        }
      },
      {
        title: 'Finalize',
        task: () => {
          // reset flags so that keys are not regenerated later
          self.configManager.setFlag(flags.generateGossipKeys, false)
          self.configManager.setFlag(flags.generateTlsKeys, false)
          self.configManager.persist()
        }
      }
    ]
  }

  async addPrepare (argv) {
    const self = this
    const prepareTasks = this.getAddPrepareTasks(argv)
    const tasks = new Listr([
      ...prepareTasks,
      self.saveContextDataTask(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addSaveContextParser)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in setting up nodes: ${e.message}`, e)
      throw new SoloError(`Error in setting up nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  async addSubmitTransactions (argv) {
    const self = this

    const transactionTasks = this.getAddTransactionTasks(argv)
    const tasks = new Listr([
      self.addInitializeTask(argv),
      self.loadContextDataTask(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
      ...transactionTasks
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in submitting transactions to node: ${e.message}`, e)
      throw new SoloError(`Error in submitting transactions to up node: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  async addExecute (argv) {
    const self = this

    const executeTasks = this.getAddExecuteTasks(argv)
    const tasks = new Listr([
      self.addInitializeTask(argv),
      this.tasks.identifyExistingNodes(),
      self.loadContextDataTask(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
      ...executeTasks
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in starting up nodes: ${e.message}`, e)
      throw new SoloError(`Error in setting up nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  /**
     * @param {Object} argv
     * @returns {Promise<boolean>}
     */
  async add (argv) {
    const self = this

    const prepareTasks = this.getAddPrepareTasks(argv)
    const transactionTasks = this.getAddTransactionTasks(argv)
    const executeTasks = this.getAddExecuteTasks(argv)
    const tasks = new Listr([
      ...prepareTasks,
      ...transactionTasks,
      ...executeTasks
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in adding nodes: ${e.message}`, e)
      throw new SoloError(`Error in adding nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
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

  /**
   * @param {NodeAlias} nodeAlias
   * @returns {Promise<void>}
   */
  async enableJVMPortForwarding (nodeAlias) {
    const podName = `network-${nodeAlias}-0`
    this.logger.debug(`Enable port forwarding for JVM debugger on pod ${podName}`)
    await this.k8.portForward(podName, constants.JVM_DEBUG_PORT, constants.JVM_DEBUG_PORT)
  }

  /**
   * @param {Object} podNames
   * @param {NodeAliases} nodeAliases
   * @param {Object[]} subTasks
   */
  startNodes (podNames, nodeAliases, subTasks) {
    for (const nodeAlias of nodeAliases) {
      const podName = podNames[nodeAlias]
      subTasks.push({
        title: `Start node: ${chalk.yellow(nodeAlias)}`,
        task: async () => {
          await this.k8.execContainer(podName, constants.ROOT_CONTAINER, ['systemctl', 'restart', 'network-node'])
        }
      })
    }
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
          .command({
            command: 'setup',
            desc: 'Setup node with a specific version of Hedera platform',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.SETUP_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node setup\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.setup(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node setup`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'start',
            desc: 'Start a node',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.START_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node start\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.start(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node start`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'stop',
            desc: 'Stop a node',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.STOP_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node stop\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.stop(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node stop`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'keys',
            desc: 'Generate node keys',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.KEYS_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node keys\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.keys(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node keys`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'refresh',
            desc: 'Reset and restart a node',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.REFRESH_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node refresh\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.refresh(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node refresh`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'logs',
            desc: 'Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
            builder: y => flags.setCommandFlags(y,
              flags.nodeAliasesUnparsed
            ),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node logs\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.logs(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node logs`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'add',
            desc: 'Adds a node with a specific version of Hedera platform',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.ADD_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node add\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.add(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node add`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'add-prepare',
            desc: 'Prepares the addition of a node with a specific version of Hedera platform',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.ADD_PREPARE_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node add-prepare\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.addPrepare(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node add`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'add-submit-transactions',
            desc: 'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.ADD_SUBMIT_TRANSACTIONS_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node add-submit-transactions\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.addSubmitTransactions(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node add`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'add-execute',
            desc: 'Executes the addition of a previously prepared node',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.ADD_EXECUTE_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node add-execute\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.addExecute(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node add`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'update',
            desc: 'Update a node with a specific version of Hedera platform',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.UPDATE_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node update\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.update(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node update`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'delete',
            desc: 'Delete a node with a specific version of Hedera platform',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.DELETE_FLAGS_LIST.concat(flags.nodeAlias)),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node delete\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.delete(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node delete`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'delete-prepare',
            desc: 'Prepares the deletion of a node with a specific version of Hedera platform',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.DELETE_PREPARE_FLAGS_LIST.concat(flags.nodeAlias)),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node delete-prepare\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.deletePrepare(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node delete-prepare`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'delete-submit-transactions',
            desc: 'Submits transactions to the network nodes for deleting a node',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.DELETE_SUBMIT_TRANSACTIONS_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node delete-submit-transactions\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.deleteSubmitTransactions(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node delete-submit-transactions`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'delete-execute',
            desc: 'Executes the deletion of a previously prepared node',
            builder: y => flags.setCommandFlags(y, ...NodeCommand.DELETE_EXECUTE_FLAGS_LIST),
            handler: argv => {
              nodeCmd.logger.debug('==== Running \'node delete-execute\' ===')
              nodeCmd.logger.debug(argv)

              nodeCmd.deleteExecute(argv).then(r => {
                nodeCmd.logger.debug('==== Finished running `node delete-execute`====')
                if (!r) process.exit(1)
              }).catch(err => {
                nodeCmd.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
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

  async update (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.app,
            flags.chartDirectory,
            flags.devMode,
            flags.debugNodeAlias,
            flags.endpointType,
            flags.force,
            flags.fstChartVersion,
            flags.gossipEndpoints,
            flags.gossipPrivateKey,
            flags.gossipPublicKey,
            flags.grpcEndpoints,
            flags.localBuildPath,
            flags.newAccountNumber,
            flags.newAdminKey,
            flags.tlsPrivateKey,
            flags.tlsPublicKey
          ])

          await prompts.execute(task, self.configManager, NodeCommand.UPDATE_FLAGS_LIST)

          /**
           * @typedef {Object} NodeUpdateConfigClass
           * -- flags --
           * @property {string} app
           * @property {string} cacheDir
           * @property {string} chartDirectory
           * @property {boolean} devMode
           * @property {string} debugNodeAlias
           * @property {string} endpointType
           * @property {string} fstChartVersion
           * @property {string} gossipEndpoints
           * @property {string} gossipPrivateKey
           * @property {string} gossipPublicKey
           * @property {string} grpcEndpoints
           * @property {string} localBuildPath
           * @property {string} namespace
           * @property {string} newAccountNumber
           * @property {string} newAdminKey
           * @property {NodeAlias} nodeAlias
           * @property {string} releaseTag
           * @property {string} tlsPrivateKey
           * @property {string} tlsPublicKey
           * -- extra args --
           * @property {PrivateKey} adminKey
           * @property {NodeAliases} allNodeAliases
           * @property {string} chartPath
           * @property {NodeAliases} existingNodeAliases
           * @property {string} freezeAdminPrivateKey
           * @property {string} keysDir
           * @property {Object} nodeClient
           * @property {Object} podNames
           * @property {Map<String, NetworkNodeServices>} serviceMap
           * @property {string} stagingDir
           * @property {string} stagingKeysDir
           * @property {PrivateKey} treasuryKey
           * -- methods --
           * @property {getUnusedConfigs} getUnusedConfigs
           */
          /**
           * @callback getUnusedConfigs
           * @returns {string[]}
           */

          // create a config object for subsequent steps
          const config = /** @type {NodeUpdateConfigClass} **/ this.getConfig(NodeCommand.UPDATE_CONFIGS_NAME, NodeCommand.UPDATE_FLAGS_LIST,
            [
              'allNodeAliases',
              'existingNodeAliases',
              'freezeAdminPrivateKey',
              'keysDir',
              'nodeClient',
              'podNames',
              'serviceMap',
              'stagingDir',
              'stagingKeysDir',
              'treasuryKey'
            ])

          config.curDate = new Date()
          config.existingNodeAliases = []

          await self.initializeSetup(config, self.k8)

          // set config in the context for later tasks to use
          ctx.config = config

          ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDirectory,
            constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

          // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
          ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace)

          const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace)
          config.freezeAdminPrivateKey = accountKeys.privateKey

          const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace)
          const treasuryAccountPrivateKey = treasuryAccount.privateKey
          config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey)

          self.logger.debug('Initialized config', { config })
        }
      },
      this.tasks.identifyExistingNodes(),
      {
        title: 'Prepare gossip endpoints',
        task: (ctx) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
          let endpoints = []
          if (!config.gossipEndpoints) {
            if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
              throw new SoloError(`--gossip-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`)
            }

            endpoints = [
              `${Templates.renderFullyQualifiedNetworkPodName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT}`,
              `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`
            ]
          } else {
            endpoints = helpers.splitFlagInput(config.gossipEndpoints)
          }

          ctx.gossipEndpoints = helpers.prepareEndpoints(config.endpointType, endpoints, constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT)
        }
      },
      {
        title: 'Prepare grpc service endpoints',
        task: (ctx) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
          let endpoints = []

          if (!config.grpcEndpoints) {
            if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
              throw new SoloError(`--grpc-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`)
            }

            endpoints = [
              `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`
            ]
          } else {
            endpoints = helpers.splitFlagInput(config.grpcEndpoints)
          }

          ctx.grpcServiceEndpoints = helpers.prepareEndpoints(config.endpointType, endpoints, constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT)
        }
      },
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount(),
      {
        title: 'Send node update transaction',
        task: async (ctx) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config

          const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias) - 1
          self.logger.info(`nodeId: ${nodeId}`)
          self.logger.info(`config.newAccountNumber: ${config.newAccountNumber}`)

          try {
            const nodeUpdateTx = await new NodeUpdateTransaction()
              .setNodeId(nodeId)

            if (config.tlsPublicKey && config.tlsPrivateKey) {
              self.logger.info(`config.tlsPublicKey: ${config.tlsPublicKey}`)
              const tlsCertDer = await this.loadPermCertificate(config.tlsPublicKey)
              const tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest()
              nodeUpdateTx.setCertificateHash(tlsCertHash)

              const publicKeyFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias)
              const privateKeyFile = Templates.renderTLSPemPrivateKeyFile(config.nodeAlias)
              renameAndCopyFile(config.tlsPublicKey, publicKeyFile, config.keysDir)
              renameAndCopyFile(config.tlsPrivateKey, privateKeyFile, config.keysDir)
            }

            if (config.gossipPublicKey && config.gossipPrivateKey) {
              self.logger.info(`config.gossipPublicKey: ${config.gossipPublicKey}`)
              const signingCertDer = await this.loadPermCertificate(config.gossipPublicKey)
              nodeUpdateTx.setGossipCaCertificate(signingCertDer)

              const publicKeyFile = Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, config.nodeAlias)
              const privateKeyFile = Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, config.nodeAlias)
              renameAndCopyFile(config.gossipPublicKey, publicKeyFile, config.keysDir)
              renameAndCopyFile(config.gossipPrivateKey, privateKeyFile, config.keysDir)
            }

            if (config.newAccountNumber) {
              nodeUpdateTx.setAccountId(config.newAccountNumber)
            }

            let parsedNewKey
            if (config.newAdminKey) {
              parsedNewKey = PrivateKey.fromStringED25519(config.newAdminKey)
              nodeUpdateTx.setAdminKey(parsedNewKey.publicKey)
            }
            await nodeUpdateTx.freezeWith(config.nodeClient)

            // config.adminKey contains the original key, needed to sign the transaction
            if (config.newAdminKey) {
              await nodeUpdateTx.sign(parsedNewKey)
            }
            const signedTx = await nodeUpdateTx.sign(config.adminKey)
            const txResp = await signedTx.execute(config.nodeClient)
            const nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient)
            this.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`)
          } catch (e) {
            this.logger.error(`Error updating node to network: ${e.message}`, e)
            this.logger.error(e.stack)
            throw new SoloError(`Error updating node to network: ${e.message}`, e)
          }
        }
      },
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.downloadNodeGeneratedFiles(),
      this.tasks.sendFreezeUpgradeTransaction(),
      {
        title: 'Prepare staging directory',
        task: async (ctx, parentTask) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
          return this.prepareStagingTask(ctx, parentTask, config.keysDir, config.stagingKeysDir, config.allNodeAliases)
        }
      },
      {
        title: 'Copy node keys to secrets',
        task: async (ctx, parentTask) => {
          return this.copyNodeKeyTask(ctx, parentTask)
        }
      },
      {
        title: 'Check network nodes are frozen',
        task: (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.existingNodeAliases, NodeStatusCodes.FREEZE_COMPLETE)
        }
      },
      {
        title: 'Get node logs and configs',
        task: async (ctx) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
          await helpers.getNodeLogs(self.k8, config.namespace)
        }
      },
      {
        title: 'Update chart to use new configMap due to account number change',
        task: async (ctx) => {
          await this.chartUpdateTask(ctx)
        },
        // no need to run this step if the account number is not changed, since config.txt will be the same
        skip: (ctx) => !ctx.config.newAccountNumber && !ctx.config.debugNodeAlias
      },
      {
        title: 'Kill nodes to pick up updated configMaps',
        task: async (ctx) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
          // the updated node will have a new pod ID if its account ID changed which is a label
          config.serviceMap = await self.accountManager.getNodeServiceMap(
            config.namespace)
          for (const /** @type {NetworkNodeServices} **/ service of config.serviceMap.values()) {
            await self.k8.kubeClient.deleteNamespacedPod(service.nodePodName, config.namespace, undefined, undefined, 1)
          }
          self.logger.info('sleep for 15 seconds to give time for pods to finish terminating')
          await sleep(15000)

          // again, the pod names will change after the pods are killed
          config.serviceMap = await self.accountManager.getNodeServiceMap(
            config.namespace)
          config.podNames = {}
          for (const service of config.serviceMap.values()) {
            config.podNames[service.nodeAlias] = service.nodePodName
          }
        }
      },
      {
        title: 'Check node pods are running',
        task: async (ctx, task) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
          return this.checkPodRunningTask(ctx, task, config.allNodeAliases)
        }
      },
      {
        title: 'Fetch platform software into network nodes',
        task:
          async (ctx, task) => {
            const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
            return self.fetchLocalOrReleasedPlatformSoftware(config.allNodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
          }
      },
      {
        title: 'Setup network nodes',
        task: async (ctx, parentTask) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Start network nodes',
        task: async (ctx, task) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
          return this.startNetworkNodesTask(task, config.podNames, config.allNodeAliases)
        }
      },
      {
        title: 'Enable port forwarding for JVM debugger',
        task: async (ctx) => {
          await this.enableJVMPortForwarding(ctx.config.debugNodeAlias)
        },
        skip: (ctx) => !ctx.config.debugNodeAlias
      },
      {
        title: 'Check all nodes are ACTIVE',
        task: async (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Check all node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: async (ctx, task) => {
          return this.checkNodesProxiesTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Trigger stake weight calculate',
        task: async (ctx) => {
          const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
          await this.triggerStakeCalculation(config)
        }
      },
      {
        title: 'Finalize',
        task: () => {
          // reset flags so that keys are not regenerated later
          self.configManager.setFlag(flags.generateGossipKeys, false)
          self.configManager.setFlag(flags.generateTlsKeys, false)
          self.configManager.persist()
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in updating nodes: ${e.message}`, e)
      this.logger.error(e.stack)
      throw new SoloError(`Error in updating nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  deleteInitializeTask (argv) {
    const self = this

    return {
      title: 'Initialize',
      task: async (ctx, task) => {
        self.configManager.update(argv)

        // disable the prompts that we don't want to prompt the user for
        prompts.disablePrompts([
          flags.app,
          flags.chainId,
          flags.chartDirectory,
          flags.devMode,
          flags.debugNodeAlias,
          flags.endpointType,
          flags.force,
          flags.fstChartVersion,
          flags.localBuildPath
        ])

        await prompts.execute(task, self.configManager, NodeCommand.DELETE_FLAGS_LIST)

        /**
       * @typedef {Object} NodeDeleteConfigClass
       * -- flags --
       * @property {string} app
       * @property {string} cacheDir
       * @property {string} chartDirectory
       * @property {boolean} devMode
       * @property {string} debugNodeAlias
       * @property {string} endpointType
       * @property {string} fstChartVersion
       * @property {string} localBuildPath
       * @property {string} namespace
       * @property {NodeAlias} nodeAlias
       * @property {string} releaseTag
       * -- extra args --
       * @property {PrivateKey} adminKey
       * @property {NodeAliases} allNodeAliases
       * @property {string} chartPath
       * @property {NodeAliases} existingNodeAliases
       * @property {string} freezeAdminPrivateKey
       * @property {string} keysDir
       * @property {Object} nodeClient
       * @property {Object} podNames
       * @property {Map<String, NetworkNodeServices>} serviceMap
       * @property {string} stagingDir
       * @property {string} stagingKeysDir
       * @property {PrivateKey} treasuryKey
       * -- methods --
       * @property {getUnusedConfigs} getUnusedConfigs
       */
        /**
       * @callback getUnusedConfigs
       * @returns {string[]}
       */

        // create a config object for subsequent steps
        const config = /** @type {NodeDeleteConfigClass} **/ this.getConfig(NodeCommand.DELETE_CONFIGS_NAME, NodeCommand.DELETE_FLAGS_LIST,
          [
            'adminKey',
            'allNodeAliases',
            'existingNodeAliases',
            'freezeAdminPrivateKey',
            'keysDir',
            'nodeClient',
            'podNames',
            'serviceMap',
            'stagingDir',
            'stagingKeysDir',
            'treasuryKey'
          ])

        config.curDate = new Date()
        config.existingNodeAliases = []

        await self.initializeSetup(config, self.k8)

        // set config in the context for later tasks to use
        ctx.config = config

        ctx.config.chartPath = await self.prepareChartPath(ctx.config.chartDirectory,
          constants.FULLSTACK_TESTING_CHART, constants.FULLSTACK_DEPLOYMENT_CHART)

        // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
        ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace)

        const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace)
        config.freezeAdminPrivateKey = accountKeys.privateKey

        const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace)
        const treasuryAccountPrivateKey = treasuryAccount.privateKey
        config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey)

        self.logger.debug('Initialized config', { config })
      }
    }
  }

  deletePrepareTasks (argv) {
    return [
      this.deleteInitializeTask(argv),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount()
    ]
  }

  deleteExecuteTasks (argv) {
    const self = this

    return [
      this.tasks.downloadNodeGeneratedFiles(),
      {
        title: 'Prepare staging directory',
        task: async (ctx, parentTask) => {
          const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
          return this.prepareStagingTask(ctx, parentTask, config.keysDir, config.stagingKeysDir, config.existingNodeAliases)
        }
      },
      {
        title: 'Copy node keys to secrets',
        task: async (ctx, parentTask) => {
          // remove nodeAlias from existingNodeAliases
          ctx.config.allNodeAliases = ctx.config.existingNodeAliases.filter(nodeAlias => nodeAlias !== ctx.config.nodeAlias)
          return this.copyNodeKeyTask(ctx, parentTask)
        }
      },
      {
        title: 'Check network nodes are frozen',
        task: (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.existingNodeAliases, NodeStatusCodes.FREEZE_COMPLETE)
        }
      },
      {
        title: 'Get node logs and configs',
        task: async (ctx) => {
          const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
          await helpers.getNodeLogs(self.k8, config.namespace)
        }
      },
      {
        title: 'Update chart to use new configMap',
        task: async (ctx) => {
          await this.chartUpdateTask(ctx)
        }
      },
      {
        title: 'Kill nodes to pick up updated configMaps',
        task: async (ctx) => {
          const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
          for (const /** @type {NetworkNodeServices} **/ service of config.serviceMap.values()) {
            await self.k8.kubeClient.deleteNamespacedPod(service.nodePodName, config.namespace, undefined, undefined, 1)
          }
        }
      },
      {
        title: 'Check node pods are running',
        task: async (ctx, task) => {
          self.logger.info('sleep 20 seconds to give time for pods to come up after being killed')
          await sleep(20000)
          const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
          return this.checkPodRunningTask(ctx, task, config.allNodeAliases)
        }
      },
      {
        title: 'Fetch platform software into all network nodes',
        task: async (ctx, task) => {
          const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
          config.serviceMap = await self.accountManager.getNodeServiceMap(
            config.namespace)
          config.podNames[config.nodeAlias] = config.serviceMap.get(
            config.nodeAlias).nodePodName
          return self.fetchLocalOrReleasedPlatformSoftware(config.allNodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
        }
      },
      {
        title: 'Setup network nodes',
        task: async (ctx, parentTask) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Start network nodes',
        task: async (ctx, task) => {
          const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
          return this.startNetworkNodesTask(task, config.podNames, config.allNodeAliases)
        }
      },
      {
        title: 'Enable port forwarding for JVM debugger',
        task: async (ctx) => {
          await this.enableJVMPortForwarding(ctx.config.debugNodeAlias)
        },
        skip: (ctx) => !ctx.config.debugNodeAlias
      },
      {
        title: 'Check all nodes are ACTIVE',
        task: async (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Check all node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: async (ctx, task) => {
          return this.checkNodesProxiesTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Trigger stake weight calculate',
        task: async (ctx) => {
          const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
          await this.triggerStakeCalculation(config)
        }
      },
      {
        title: 'Finalize',
        task: () => {
          // reset flags so that keys are not regenerated later
          self.configManager.setFlag(flags.generateGossipKeys, false)
          self.configManager.setFlag(flags.generateTlsKeys, false)
          self.configManager.persist()
        }
      }
    ]
  }

  deleteSubmitTransactionsTasks (argv) {
    return [

      {
        title: 'Send node delete transaction',
        task: async (ctx, task) => {
          const config = /** @type {NodeDeleteConfigClass} **/ ctx.config

          try {
            const accountMap = getNodeAccountMap(config.existingNodeAliases)
            const deleteAccountId = accountMap.get(config.nodeAlias)
            this.logger.debug(`Deleting node: ${config.nodeAlias} with account: ${deleteAccountId}`)
            const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias) - 1
            const nodeDeleteTx = await new NodeDeleteTransaction()
              .setNodeId(nodeId)
              .freezeWith(config.nodeClient)

            const signedTx = await nodeDeleteTx.sign(config.adminKey)
            const txResp = await signedTx.execute(config.nodeClient)
            const nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient)
            this.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`)
          } catch (e) {
            this.logger.error(`Error deleting node from network: ${e.message}`, e)
            throw new SoloError(`Error deleting node from network: ${e.message}`, e)
          }
        }
      },
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  async deletePrepare (argv) {
    const self = this

    const tasks = new Listr([
      ...self.deletePrepareTasks(argv),
      self.saveContextDataTask(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteSaveContextParser)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in deleting nodes: ${e.message}`, e)
      throw new SoloError(`Error in deleting nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  async deleteExecute (argv) {
    const self = this

    const tasks = new Listr([
      self.deleteInitializeTask(argv),
      self.loadContextDataTask(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
      ...self.deleteExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in deleting nodes: ${e.message}`, e)
      throw new SoloError(`Error in deleting nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  async deleteSubmitTransactions (argv) {
    const self = this

    const tasks = new Listr([
      self.deleteInitializeTask(argv),
      self.loadContextDataTask(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
      ...self.deleteSubmitTransactionsTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in deleting nodes: ${e.message}`, e)
      throw new SoloError(`Error in deleting nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  async delete (argv) {
    const self = this

    const tasks = new Listr([
      ...self.deletePrepareTasks(argv),
      ...self.deleteSubmitTransactionsTasks(argv),
      ...self.deleteExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      self.logger.error(`Error in deleting nodes: ${e.message}`, e)
      throw new SoloError(`Error in deleting nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }
}
