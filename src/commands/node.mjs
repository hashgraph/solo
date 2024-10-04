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
import * as NodeFlags from './node/flags.mjs'
import {NodeCommandHandlers} from "./node/handlers.mjs";
import {downloadGeneratedFilesConfigBuilder} from "./node/configs.mjs";

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
   * @returns {string}
   */
  static get KEYS_CONFIGS_NAME () {
    return 'keysConfigs'
  }

  /**
   * @returns {string}
   */
  static get REFRESH_CONFIGS_NAME () {
    return 'refreshConfigs'
  }


  /**
   * @returns {string}
   */
  static get ADD_CONFIGS_NAME () {
    return 'addConfigs'
  }

  static get DELETE_CONFIGS_NAME () {
    return 'deleteConfigs'
  }


  static get UPDATE_CONFIGS_NAME () {
    return 'updateConfigs'
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

          await prompts.execute(task, self.configManager, NodeFlags.SETUP_FLAGS_LIST)

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
          const config = /** @type {NodeSetupConfigClass} **/ this.getConfig(NodeCommand.SETUP_CONFIGS_NAME, NodeFlags.SETUP_FLAGS_LIST,
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
      this.tasks.fetchPlatformSoftware(),
      this.tasks.setupNetworkNodes('nodeAliases')
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
      this.tasks.startNodes('nodeAliases'),
      this.tasks.enablePortForwarding(),
      this.tasks.checkAllNodesAreActive('nodeAliases'),
      this.tasks.checkNodeProxiesAreActive(() => self.configManager.getFlag(flags.app) !== '' && self.configManager.getFlag(flags.app) !== constants.HEDERA_APP_NAME),
      this.tasks.addNodeStakes(),
      ], {
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
      this.tasks.stopNodes()
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

          await prompts.execute(task, self.configManager, NodeFlags.KEYS_FLAGS_LIST)

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
          const config = /** @type {NodeKeysConfigClass} **/ this.getConfig(NodeCommand.KEYS_CONFIGS_NAME, NodeFlags.KEYS_FLAGS_LIST,
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
      this.tasks.generateGossipKeys(),
      this.tasks.generateGrpcTlsKeys(),
      this.tasks.finalize()
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

          await prompts.execute(task, self.configManager, NodeFlags.REFRESH_FLAGS_LIST)

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
          ctx.config = /** @type {NodeRefreshConfigClass} **/ this.getConfig(NodeCommand.REFRESH_CONFIGS_NAME, NodeFlags.REFRESH_FLAGS_LIST,
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
      this.tasks.dumpNetworkNodesSaveState(),
      this.tasks.fetchPlatformSoftware(),
      this.tasks.setupNetworkNodes('nodeAliases'),
      this.tasks.checkAllNodesAreActive('nodeAliases'),
      this.tasks.checkNodeProxiesAreActive((ctx) => ctx.config.app !== '')
    ], {
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
      this.tasks.getNodeLogsAndConfigs(),
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

        await prompts.execute(task, self.configManager, NodeFlags.ADD_FLAGS_LIST)

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
        const config = /** @type {NodeAddConfigClass} **/ this.getConfig(NodeCommand.ADD_CONFIGS_NAME, NodeFlags.ADD_FLAGS_LIST,
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

  getAddTransactionTasks (argv) {
    return [
      this.tasks.sendNodeCreateTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  getAddExecuteTasks (argv) {
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

  async addPrepare (argv) {
    const self = this
    const prepareTasks = this.getAddPrepareTasks(argv)
    const tasks = new Listr([
      ...prepareTasks,
      this.tasks.saveContextData(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addSaveContextParser)
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
      this.tasks.loadContextData(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
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
      this.tasks.loadContextData(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.SETUP_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.START_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.STOP_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.KEYS_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.REFRESH_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.ADD_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.ADD_PREPARE_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.ADD_SUBMIT_TRANSACTIONS_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.ADD_EXECUTE_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.UPDATE_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.DELETE_FLAGS_LIST.concat(flags.nodeAlias)),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.DELETE_PREPARE_FLAGS_LIST.concat(flags.nodeAlias)),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.DELETE_SUBMIT_TRANSACTIONS_FLAGS_LIST),
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
            builder: y => flags.setCommandFlags(y, ...NodeFlags.DELETE_EXECUTE_FLAGS_LIST),
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
      this.tasks.initialize(argv, downloadGeneratedFilesConfigBuilder.bind(this)),
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

          await prompts.execute(task, self.configManager, NodeFlags.UPDATE_FLAGS_LIST)

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
          const config = /** @type {NodeUpdateConfigClass} **/ this.getConfig(NodeCommand.UPDATE_CONFIGS_NAME, NodeFlags.UPDATE_FLAGS_LIST,
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

        await prompts.execute(task, self.configManager, NodeFlags.DELETE_FLAGS_LIST)

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
        const config = /** @type {NodeDeleteConfigClass} **/ this.getConfig(NodeCommand.DELETE_CONFIGS_NAME, NodeFlags.DELETE_FLAGS_LIST,
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
      this.tasks.prepareStagingDirectory('existingNodeAliases'),
      this.tasks.copyNodeKeysToSecrets(),
      {
        title: 'TODO find a place for this',
        task: async (ctx, parentTask) => {
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

  deleteSubmitTransactionsTasks (argv) {
    return [
      this.tasks.sendNodeDeleteTransaction(),
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  async deletePrepare (argv) {
    const self = this

    const tasks = new Listr([
      ...self.deletePrepareTasks(argv),
      this.tasks.saveContextData(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteSaveContextParser)
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
      this.tasks.loadContextData(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
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
      this.tasks.loadContextData(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
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
