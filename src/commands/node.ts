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
import * as x509 from '@peculiar/x509'
import chalk from 'chalk'
import * as fs from 'fs'
import {Listr, ListrTaskWrapper} from 'listr2'
import path from 'path'
import { SoloError, IllegalArgumentError } from '../core/errors'
import * as helpers from '../core/helpers'
import {
  addDebugOptions,
  getNodeAccountMap,
  getNodeLogs,
  renameAndCopyFile,
  sleep,
  validatePath
} from '../core/helpers'
import {
  constants,
  K8,
  KeyManager,
  PlatformInstaller,
  ProfileManager,
  Templates,
  YargsCommand
} from '../core'
import { BaseCommand } from './base'
import * as flags from './flags'
import * as prompts from './prompts'

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
  LOCAL_HOST, SECONDS
} from '../core/constants'
import { NodeStatusCodes, NodeStatusEnums } from '../core/enumerations'
import { NodeCommandTasks } from './node/tasks'
import { downloadGeneratedFilesConfigBuilder, prepareUpgradeConfigBuilder } from './node/configs'

import { type NetworkNodeServices } from "../core/network_node_services";
import { type AccountManager } from "../core/account_manager";
import { type Opts } from '../index'
import { type NodeAlias, type NodeAliases, type PodName } from '../types/aliases.js'
import { type ExtendedNetServer } from '../types'

export interface NodeAddConfigClass {
  app: string
  cacheDir: string
  chainId: string
  chartDirectory: string
  devMode: boolean
  debugNodeAlias: NodeAlias
  endpointType: string
  soloChartVersion: string
  generateGossipKeys: boolean
  generateTlsKeys: boolean
  gossipEndpoints: string
  grpcEndpoints: string
  localBuildPath: string
  namespace: string
  nodeAlias: NodeAlias
  releaseTag: string
  adminKey: PrivateKey
  allNodeAliases: NodeAliases
  chartPath: string
  curDate: Date
  existingNodeAliases: NodeAliases
  freezeAdminPrivateKey: string
  keysDir: string
  lastStateZipPath: string
  nodeClient: any
  podNames: Record<NodeAlias, PodName>
  serviceMap: Map<String, NetworkNodeServices>
  treasuryKey: PrivateKey
  stagingDir: string
  stagingKeysDir: string
  getUnusedConfigs: () => string[]
}

export interface NodeDeleteConfigClass {
  app: string
  cacheDir: string
  chartDirectory: string
  devMode: boolean
  debugNodeAlias: NodeAlias
  endpointType: string
  soloChartVersion: string
  localBuildPath: string
  namespace: string
  nodeAlias: NodeAlias
  releaseTag: string
  adminKey: PrivateKey
  allNodeAliases: NodeAliases
  chartPath: string
  existingNodeAliases: NodeAliases
  freezeAdminPrivateKey: string
  keysDir: string
  nodeClient: any
  podNames: Record<NodeAlias, PodName>
  serviceMap: Map<String, NetworkNodeServices>
  stagingDir: string
  stagingKeysDir: string
  treasuryKey: PrivateKey
  getUnusedConfigs: () => string[]
  curDate: Date
}

/**
 * Defines the core functionalities of 'node' command
 */
export class NodeCommand extends BaseCommand {
  private readonly platformInstaller: PlatformInstaller;
  private readonly keyManager: KeyManager;
  private readonly accountManager: AccountManager;
  private readonly profileManager: ProfileManager;
  private _portForwards: ExtendedNetServer[];
  private readonly tasks: NodeCommandTasks;
  private profileValuesFile?: string;

  constructor (opts: Opts) {
    super(opts)

    if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)
    if (!opts || !opts.keyManager) throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager)
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.profileManager) throw new IllegalArgumentError('An instance of ProfileManager is required', opts.profileManager)

    this.platformInstaller = opts.platformInstaller
    this.keyManager = opts.keyManager
    this.accountManager = opts.accountManager
    this.profileManager = opts.profileManager
    this._portForwards = []

    this.tasks = new NodeCommandTasks({
      accountManager: opts.accountManager,
      configManager: opts.configManager,
      logger: opts.logger,
      k8: opts.k8
    })
  }

  static get ADD_CONTEXT_FILE () {
    return 'node-add.json'
  }

  static get DELETE_CONTEXT_FILE () {
    return 'node-delete.json'
  }

  static get SETUP_CONFIGS_NAME () {
    return 'setupConfigs'
  }

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

  static get START_FLAGS_LIST () {
    return [
      flags.app,
      flags.debugNodeAlias,
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.quiet
    ]
  }

  static get STOP_FLAGS_LIST () {
    return [
      flags.namespace,
      flags.nodeAliasesUnparsed,
      flags.quiet
    ]
  }

  static get KEYS_CONFIGS_NAME () {
    return 'keysConfigs'
  }

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

  static get REFRESH_CONFIGS_NAME () {
    return 'refreshConfigs'
  }

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

  static get ADD_CONFIGS_NAME () {
    return 'addConfigs'
  }

  static get COMMON_ADD_FLAGS_LIST () {
    return [
      flags.app,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.devMode,
      flags.debugNodeAlias,
      flags.endpointType,
      flags.soloChartVersion,
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

  static get ADD_FLAGS_LIST () {
    const commonFlags = NodeCommand.COMMON_ADD_FLAGS_LIST
    return [
      ...commonFlags,
      flags.adminKey
    ]
  }

  static get ADD_PREPARE_FLAGS_LIST () {
    const commonFlags = NodeCommand.COMMON_ADD_FLAGS_LIST
    return [
      ...commonFlags,
      flags.adminKey,
      flags.outputDir
    ]
  }

  static get ADD_SUBMIT_TRANSACTIONS_FLAGS_LIST () {
    const commonFlags = NodeCommand.COMMON_ADD_FLAGS_LIST
    return [
      ...commonFlags,
      flags.inputDir
    ]
  }

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
      flags.soloChartVersion,
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
   * - calls the accountManager.close()
   * - for all portForwards, calls k8.stopPortForward(srv)
   */
  async close () {
    await this.accountManager.close()
    if (this._portForwards) {
      for (const srv of this._portForwards) {
        await this.k8.stopPortForward(srv)
      }
    }

    this._portForwards = []
  }

  async addStake (namespace: string, accountId: string, nodeAlias: NodeAlias) {
    try {
      await this.accountManager.loadNodeClient(namespace)
      const client = this.accountManager._nodeClient
      const treasuryKey = await this.accountManager.getTreasuryAccountKeys(namespace)
      const treasuryPrivateKey = PrivateKey.fromStringED25519(treasuryKey.privateKey)
      client.setOperator(TREASURY_ACCOUNT_ID, treasuryPrivateKey)

      // get some initial balance
      await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, +HEDERA_NODE_DEFAULT_STAKE_AMOUNT + 1)

      // check balance
      const balance = await new AccountBalanceQuery()
        .setAccountId(accountId)
        .execute(client)
      this.logger.debug(`Account ${accountId} balance: ${balance.hbars}`)

      // Create the transaction
      const transaction = new AccountUpdateTransaction()
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
    } catch (e: Error | any) {
      throw new SoloError(`Error in adding stake: ${e.message}`, e)
    }
  }

  async checkNetworkNodeActiveness (namespace: string, nodeAlias: NodeAlias, task: ListrTaskWrapper<any, any, any>,
    title: string, index: number, status = NodeStatusCodes.ACTIVE,
    maxAttempts = 120, delay = 1_000, timeout = 1_000) {
    nodeAlias = nodeAlias.trim() as NodeAlias
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

    await sleep(1.5 * SECONDS) // delaying prevents - gRPC service error

    return podName
  }

  checkNodeActivenessTask (ctx: any, task: ListrTaskWrapper<any, any, any>, nodeAliases: NodeAliases, status = NodeStatusCodes.ACTIVE) {
    const { config: { namespace } } = ctx

    const subTasks = nodeAliases.map((nodeAlias, i) => {
      const reminder = ('debugNodeAlias' in ctx.config && ctx.config.debugNodeAlias === nodeAlias) ? 'Please attach JVM debugger now.' : ''
      const title = `Check network pod: ${chalk.yellow(nodeAlias)} ${chalk.red(reminder)}`

      const subTask = async (ctx: any, task: ListrTaskWrapper<any, any, any>) => {
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

  /** Return task for checking for all network node pods */
  checkPodRunningTask (ctx: any, task: ListrTaskWrapper<any, any, any>, nodeAliases: NodeAliases) {
    const subTasks = []
    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check Node: ${chalk.yellow(nodeAlias)}`,
        task: async () =>
          await this.k8.waitForPods([constants.POD_PHASE_RUNNING], [
            'solo.hedera.com/type=network-node',
            `solo.hedera.com/node-name=${nodeAlias}`
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

  /** Return task for setup network nodes */
  setupNodesTask (ctx: any, task: ListrTaskWrapper<any, any, any>, nodeAliases: NodeAliases): any {
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

  /** Return task for start network node hedera service */
  startNetworkNodesTask (task: ListrTaskWrapper<any, any, any>, podNames: Record<NodeAlias, PodName>, nodeAliases: NodeAliases) {
    const subTasks: any[] = []
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

  /** Return task for check if node proxies are ready */
  checkNodesProxiesTask (ctx: any, task: ListrTaskWrapper<any, any, any>, nodeAliases: NodeAliases) {
    const subTasks = []
    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check proxy for node: ${chalk.yellow(nodeAlias)}`,
        task: async () => await this.k8.waitForPodReady(
          [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'],
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
   * @returns return task for repairing staging directory
   */
  prepareStagingTask (ctx: any, task: ListrTaskWrapper<any, any, any>, keysDir: string, stagingKeysDir: string, nodeAliases: NodeAliases) {
    const subTasks = [
      {
        title: 'Copy Gossip keys to staging',
        task: async () => {
          this.keyManager.copyGossipKeysToStaging(keysDir, stagingKeysDir, nodeAliases)
        }
      },
      {
        title: 'Copy gRPC TLS keys to staging',
        task: async () => {
          for (const nodeAlias of nodeAliases) {
            const tlsKeyFiles = this.keyManager.prepareTLSKeyFilePaths(nodeAlias, keysDir)
            this.keyManager.copyNodeKeysToStaging(tlsKeyFiles, stagingKeysDir)
          }
        }
      }
    ]
    return task.newListr(subTasks, {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })
  }

  /** Return task for copy node key to staging directory */
  copyNodeKeyTask (ctx: any, task: ListrTaskWrapper<any, any, any>) {
    const subTasks = this.platformInstaller.copyNodeKeys(ctx.config.stagingDir, ctx.config.allNodeAliases)

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })
  }

  /** Prepare parameter and update the network node chart */
  async chartUpdateTask (ctx: any) {
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
      constants.SOLO_DEPLOYMENT_CHART,
      config.chartPath,
      valuesArg,
      config.soloChartVersion
    )
  }

  /** Update account manager and transfer hbar for staking purpose */
  async triggerStakeCalculation (config: any) {
    this.logger.info('sleep 60 seconds for the handler to be able to trigger the network node stake weight recalculate')
    await sleep(60 * SECONDS)
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

  async initializeSetup (config: any, k8: K8) {
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

  uploadPlatformSoftware (nodeAliases: NodeAliases, podNames: any, task: ListrTaskWrapper<any, any, any>,
    localBuildPath: string) {
    const subTasks = []

    this.logger.debug('no need to fetch, use local build jar files')

    const buildPathMap: Map<NodeAlias, string> = new Map()

    let defaultDataLibBuildPath: string

    const parameterPairs = localBuildPath.split(',')
    for (const parameterPair of parameterPairs) {
      if (parameterPair.includes('=')) {
        const [nodeAlias, localDataLibBuildPath] = parameterPair.split('=')
        buildPathMap.set(nodeAlias as NodeAlias, localDataLibBuildPath)
      } else {
        defaultDataLibBuildPath = parameterPair
      }
    }

    let localDataLibBuildPath: string

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
          // filter the data/config and data/keys to avoid failures due to config and secret mounts
          const filterFunction = (path: string, stat: any) =>
            !(path.includes('data/keys') || path.includes('data/config'))

          await this.k8.copyTo(podName, constants.ROOT_CONTAINER, localDataLibBuildPath,
              `${constants.HEDERA_HAPI_PATH}`, filterFunction)

          const testJsonFiles: string[] = this.configManager.getFlag<string>(flags.appConfig)!.split(',')

          for (const jsonFile of testJsonFiles) {
            if (fs.existsSync(jsonFile)) {
              await this.k8.copyTo(podName, constants.ROOT_CONTAINER, jsonFile, `${constants.HEDERA_HAPI_PATH}`)
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

  fetchLocalOrReleasedPlatformSoftware (nodeAliases: NodeAliases, podNames: any, releaseTag: string,
    task: ListrTaskWrapper<any, any, any>, localBuildPath: string) {
    if (localBuildPath !== '') {
      return this.uploadPlatformSoftware(nodeAliases, podNames, task, localBuildPath)
    } else {
      return this.fetchPlatformSoftware(nodeAliases, podNames, releaseTag, task, this.platformInstaller)
    }
  }

  fetchPlatformSoftware (nodeAliases: NodeAliases, podNames: object, releaseTag: string,
    task: ListrTaskWrapper<any, any, any>, platformInstaller: PlatformInstaller) {
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

  loadPermCertificate (certFullPath: string) {
    const certPem = fs.readFileSync(certFullPath).toString()
    const decodedDers = x509.PemConverter.decode(certPem)
    if (!decodedDers || decodedDers.length === 0) {
      throw new SoloError('unable to load perm key: ' + certFullPath)
    }
    return (new Uint8Array(decodedDers[0]))
  }

  prepareEndpoints (endpointType: string, endpoints: string[], defaultPort: number): ServiceEndpoint[] {
    const ret: ServiceEndpoint[] = []
    for (const endpoint of endpoints) {
      const parts = endpoint.split(':')

      let url = ''
      let port = defaultPort

      if (parts.length === 2) {
        url = parts[0].trim()
        port = +parts[1].trim()
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
  async setup (argv: any) {
    interface NodeSetupConfigClass {
      app: string
      appConfig: string
      cacheDir: string
      devMode: boolean
      localBuildPath: string
      namespace: string
      nodeAliasesUnparsed: string
      releaseTag: string
      nodeAliases: NodeAliases
      podNames: Object
      getUnusedConfigs: () => string[]
    }

    interface Context {
      config: NodeSetupConfigClass
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.app,
            flags.appConfig,
            flags.devMode,
            flags.localBuildPath
          ])

          await prompts.execute(task, this.configManager, NodeCommand.SETUP_FLAGS_LIST)

          // create a config object for subsequent steps
          const config = <NodeSetupConfigClass>this.getConfig(NodeCommand.SETUP_CONFIGS_NAME, NodeCommand.SETUP_FLAGS_LIST,
            ['nodeAliases', 'podNames'])

          config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed)

          await this.initializeSetup(config, this.k8)

          // set config in the context for later tasks to use
          ctx.config = config

          this.logger.debug('Initialized config', { config })
        }
      },
      // @ts-ignore
      this.tasks.identifyNetworkPods(),
      {
        title: 'Fetch platform software into network nodes',
        task: (ctx, task) => {
          const config = ctx.config
          return this.fetchLocalOrReleasedPlatformSoftware(config.nodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
        }
      },
      {
        title: 'Setup network nodes',
        task: (ctx, parentTask) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.nodeAliases)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error in setting up nodes: ${e.message}`, e)
    }

    return true
  }

  async start (argv: any) {
    interface Context {
      config: {
        app: string
        cacheDir: string
        debugNodeAlias: NodeAlias
        namespace: string
        nodeAliases: NodeAliases
        stagingDir: string,
        podNames: Record<NodeAlias, PodName>
      }
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)

          await prompts.execute(task, this.configManager, [
            flags.namespace,
            flags.nodeAliasesUnparsed
          ])

          // @ts-ignore
          ctx.config = {
            app: <string>this.configManager.getFlag<string>(flags.app),
            cacheDir: <string>this.configManager.getFlag<string>(flags.cacheDir),
            debugNodeAlias: <NodeAlias>this.configManager.getFlag<NodeAlias>(flags.debugNodeAlias),
            namespace: <string>this.configManager.getFlag<string>(flags.namespace),
            nodeAliases: helpers.parseNodeAliases(<string>this.configManager.getFlag<string>(flags.nodeAliasesUnparsed))
          }

          ctx.config.stagingDir = Templates.renderStagingDir(
            this.configManager.getFlag(flags.cacheDir),
            this.configManager.getFlag(flags.releaseTag)
          )

          if (!await this.k8.hasNamespace(ctx.config.namespace)) {
            throw new SoloError(`namespace ${ctx.config.namespace} does not exist`)
          }
        }
      },
      // @ts-ignore
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
        task: (ctx, parentTask) => {
          return this.checkNodesProxiesTask(ctx, parentTask, ctx.config.nodeAliases)
        },
        skip: () => this.configManager.getFlag(flags.app) !== '' && this.configManager.getFlag(flags.app) !== constants.HEDERA_APP_NAME
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
                task: async () => await this.addStake(ctx.config.namespace, accountId, nodeAlias)
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
      this.logger.debug('node start has completed')
    } catch (e: Error | any) {
      throw new SoloError(`Error starting node: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  async stop (argv: any) {
    interface Context {
      config : {
        namespace: string
        nodeAliases: NodeAliases
        podNames: Record<PodName, NodeAlias>
      }
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)
          await prompts.execute(task, this.configManager, [
            flags.namespace,
            flags.nodeAliasesUnparsed
          ])

          // @ts-ignore
          ctx.config = {
            namespace: this.configManager.getFlag(flags.namespace),
            nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed))
          }

          if (!await this.k8.hasNamespace(ctx.config.namespace)) {
            throw new SoloError(`namespace ${ctx.config.namespace} does not exist`)
          }
        }
      },
      // @ts-ignore
      this.tasks.identifyNetworkPods(),
      {
        title: 'Stopping nodes',
        task: (ctx, task) => {
          const subTasks = []
          for (const nodeAlias of ctx.config.nodeAliases) {
            const podName = ctx.config.podNames[nodeAlias]
            subTasks.push({
              title: `Stop node: ${chalk.yellow(nodeAlias)}`,
              task: async () => await this.k8.execContainer(podName, constants.ROOT_CONTAINER, 'systemctl stop network-node')
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
    } catch (e: Error | any) {
      throw new SoloError('Error stopping node', e)
    }

    return true
  }

  async keys (argv: any) {
    interface NodeKeysConfigClass {
      cacheDir: string
      devMode: boolean
      generateGossipKeys: boolean
      generateTlsKeys: boolean
      nodeAliasesUnparsed: string
      curDate: Date
      keysDir: string
      nodeAliases: NodeAliases
      getUnusedConfigs: () => string[]
    }

    interface Context {
      config: NodeKeysConfigClass
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.devMode
          ])

          await prompts.execute(task, this.configManager, NodeCommand.KEYS_FLAGS_LIST)

          // create a config object for subsequent steps
          const config = <NodeKeysConfigClass>this.getConfig(NodeCommand.KEYS_CONFIGS_NAME, NodeCommand.KEYS_FLAGS_LIST,
            [
              'curDate',
              'keysDir',
              'nodeAliases'
            ])

          config.curDate = new Date()
          config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed)
          config.keysDir = path.join(this.configManager.getFlag(flags.cacheDir), 'keys')

          if (!fs.existsSync(config.keysDir)) {
            fs.mkdirSync(config.keysDir)
          }

          ctx.config = config
        }
      },
      {
        title: 'Generate gossip keys',
        task: (ctx, parentTask) => {
          const config = ctx.config
          // @ts-ignore
          const subTasks = this.keyManager.taskGenerateGossipKeys(config.nodeAliases, config.keysDir, config.curDate) // TODO REVIEW?
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
        task: (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = this.keyManager.taskGenerateTLSKeys(config.nodeAliases, config.keysDir, config.curDate)
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
          this.configManager.setFlag(flags.generateGossipKeys, false)
          this.configManager.setFlag(flags.generateTlsKeys, false)
          this.configManager.persist()
        }
      }
    ])

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error generating keys: ${e.message}`, e)
    }

    return true
  }

  async refresh (argv: any) {
    interface NodeRefreshConfigClass {
      app: string
      cacheDir: string
      devMode: boolean
      localBuildPath: string
      namespace: string
      nodeAliasesUnparsed: string
      releaseTag: string
      nodeAliases: NodeAliases
      podNames: Record<NodeAlias, PodName>
      getUnusedConfigs: () => string[]
    }

    interface Context {
      config: NodeRefreshConfigClass
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)
          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.app,
            flags.devMode,
            flags.localBuildPath
          ])

          await prompts.execute(task, this.configManager, NodeCommand.REFRESH_FLAGS_LIST)

          // create a config object for subsequent steps
          ctx.config = <NodeRefreshConfigClass>this.getConfig(NodeCommand.REFRESH_CONFIGS_NAME, NodeCommand.REFRESH_FLAGS_LIST,
            ['nodeAliases', 'podNames'])

          ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed)

          await this.initializeSetup(ctx.config, this.k8)

          this.logger.debug('Initialized config', ctx.config)
        }
      },
      // @ts-ignore
      this.tasks.identifyNetworkPods(),
      {
        title: 'Dump network nodes saved state',
        task: (ctx, task) => {
          const config = ctx.config
          const subTasks = []
          for (const nodeAlias of config.nodeAliases) {
            const podName = config.podNames[nodeAlias]
            subTasks.push({
              title: `Node: ${chalk.yellow(nodeAlias)}`,
              task: async () =>
                await this.k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -rf ${constants.HEDERA_HAPI_PATH}/data/saved/*`])
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
        task: (ctx, task) => {
          const config = ctx.config
          return this.fetchLocalOrReleasedPlatformSoftware(config.nodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
        }
      },
      {
        title: 'Setup network nodes',
        task: (ctx, parentTask) => {
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
        task: (ctx, task) => {
          return this.checkNodesProxiesTask(ctx, task, ctx.config.nodeAliases)
        },
        skip: (ctx) => ctx.config.app !== ''
      }], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error in refreshing nodes: ${e.message}`, e)
    }

    return true
  }

  async logs (argv: any) {
    interface Context {
      config: {
        namespace: string
        nodeAliases: string[]
      }
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          await prompts.execute(task, this.configManager, [
            flags.nodeAliasesUnparsed
          ])

          ctx.config = {
            namespace: <string>this.configManager.getFlag<string>(flags.namespace),
            nodeAliases: helpers.parseNodeAliases(<string>this.configManager.getFlag<string>(flags.nodeAliasesUnparsed))
          }
          this.logger.debug('Initialized config', { config: ctx.config })
        }
      },
      {
        title: 'Copy logs from all nodes',
        task: async (ctx) => {
          await getNodeLogs(this.k8, ctx.config.namespace)
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      throw new SoloError(`Error in downloading log from nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  addInitializeTask (argv: any) {
    interface Context {
      config: NodeAddConfigClass
      adminKey: PrivateKey
    }

    return {
      title: 'Initialize',
      task: async (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
        this.configManager.update(argv)

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
          flags.soloChartVersion,
          flags.localBuildPath,
          flags.gossipEndpoints,
          flags.grpcEndpoints
        ])

        await prompts.execute(task, this.configManager, NodeCommand.ADD_FLAGS_LIST)

        // create a config object for subsequent steps
        const config = this.getConfig(NodeCommand.ADD_CONFIGS_NAME, NodeCommand.ADD_FLAGS_LIST,
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
          ]) as NodeAddConfigClass

        ctx.adminKey = argv[flags.adminKey.name] ? PrivateKey.fromStringED25519(argv[flags.adminKey.name]) : PrivateKey.fromStringED25519(constants.GENESIS_KEY)
        config.curDate = new Date()
        config.existingNodeAliases = []

        await this.initializeSetup(config, this.k8)

        // set config in the context for later tasks to use
        ctx.config = config

        ctx.config.chartPath = await this.prepareChartPath(ctx.config.chartDirectory,
          constants.SOLO_TESTING_CHART, constants.SOLO_DEPLOYMENT_CHART)

        // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
        ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace)

        const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace)
        config.freezeAdminPrivateKey = accountKeys.privateKey

        const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace)
        const treasuryAccountPrivateKey = treasuryAccount.privateKey
        config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey)

        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace)

        this.logger.debug('Initialized config', { config })
      }
    }
  }

  getAddPrepareTasks (argv: any) {
    interface Context {
      config: NodeAddConfigClass
      maxNum: number
      newNode: {accountId: string, name: string}
      signingCertDer: Uint8Array
      tlsCertHash: Buffer
      gossipEndpoints: ServiceEndpoint[]
      grpcServiceEndpoints: ServiceEndpoint[]
    }

    return [
      this.addInitializeTask(argv),
      {
        title: 'Check that PVCs are enabled',
        task: () => {
          if (!this.configManager.getFlag(flags.persistentVolumeClaims)) {
            throw new SoloError('PVCs are not enabled. Please enable PVCs before adding a node')
          }
        }
      },
      this.tasks.identifyExistingNodes(),
      {
        title: 'Determine new node account number',
        task: (ctx: Context) => {
          const config = ctx.config
          const values = { hedera: { nodes: [] } }
          let maxNum = 0

          let lastNodeAlias = DEFAULT_NETWORK_NODE_NAME as NodeAlias

          for (const networkNodeServices of config.serviceMap.values()) {
            values.hedera.nodes.push({
              accountId: networkNodeServices.accountId,
              name: networkNodeServices.nodeAlias
            })
            maxNum = maxNum > AccountId.fromString(networkNodeServices.accountId).num
              ? maxNum
              : AccountId.fromString(networkNodeServices.accountId).num
            lastNodeAlias = networkNodeServices.nodeAlias as NodeAlias
          }

          const lastNodeIdMatch = lastNodeAlias.match(/\d+$/)
          if (lastNodeIdMatch.length) {
            const incremented = parseInt(lastNodeIdMatch[0]) + 1
            lastNodeAlias = lastNodeAlias.replace(/\d+$/, incremented.toString()) as NodeAlias
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
        task: (ctx: Context, parentTask: ListrTaskWrapper<any, any, any>) => {
          const config = ctx.config

          // @ts-ignore
          const subTasks = this.keyManager.taskGenerateGossipKeys([config.nodeAlias], config.keysDir, config.curDate, config.allNodeAliases) // TODO REVIEW?
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx: Context) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS key',
        task: (ctx: Context, parentTask: ListrTaskWrapper<any, any, any>) => {
          const config = ctx.config
          const subTasks = this.keyManager.taskGenerateTLSKeys([config.nodeAlias], config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx: Context) => !ctx.config.generateTlsKeys
      },
      {
        title: 'Load signing key certificate',
        task: async (ctx: Context) => {
          const config = ctx.config
          const signingCertFile = Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, config.nodeAlias)
          const signingCertFullPath = path.join(config.keysDir, signingCertFile)
          ctx.signingCertDer = this.loadPermCertificate(signingCertFullPath)
        }
      },
      {
        title: 'Compute mTLS certificate hash',
        task: async (ctx: Context) => {
          const config = ctx.config
          const tlsCertFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias)
          const tlsCertFullPath = path.join(config.keysDir, tlsCertFile)
          const tlsCertDer = this.loadPermCertificate(tlsCertFullPath)
          ctx.tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest()
        }
      },
      {
        title: 'Prepare gossip endpoints',
        task: (ctx: Context) => {
          const config = ctx.config
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
        task: (ctx: Context) => {
          const config = ctx.config
          let endpoints: string[] = []

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

  saveContextDataTask (argv: any, targetFile: string, parser: (ctx: any) => string) {
    return {
      title: 'Save context data',
      task: (ctx: any) => {
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

  loadContextDataTask (argv: any, targetFile: string, parser: (ctx: any, ctxData: any) => any) {
    return {
      title: 'Load context data',
      task: (ctx: any) => {
        const inputDir = argv[flags.inputDir.name]
        if (!inputDir) {
          throw new SoloError(`Path to context data not specified. Please set a value for --${flags.inputDir.name}`)
        }
        // @ts-ignore
        const ctxData = JSON.parse(fs.readFileSync(path.join(inputDir, targetFile)))
        parser(ctx, ctxData)
      }
    }
  }

  getAddTransactionTasks (argv: any) {
    return [
      {
        title: 'Send node create transaction',
        task: async (ctx: any) => {
          const config: NodeAddConfigClass = ctx.config

          try {
            const nodeCreateTx = new NodeCreateTransaction()
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
          } catch (e: Error | any) {
            this.logger.error(`Error adding node to network: ${e.message}`, e)
            throw new SoloError(`Error adding node to network: ${e.message}`, e)
          }
        }
      },
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  getAddExecuteTasks (argv: any) {
    interface Context {
      config: NodeAddConfigClass
      newNode: { accountId: string }
    }

    return [
      this.tasks.downloadNodeGeneratedFiles(),
      {
        title: 'Prepare staging directory',
        task: (ctx: Context, parentTask: ListrTaskWrapper<any, any, any>) => {
          return this.prepareStagingTask(ctx, parentTask, ctx.config.keysDir, ctx.config.stagingKeysDir, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Copy node keys to secrets',
        task: (ctx: Context, parentTask: ListrTaskWrapper<any, any, any>) => {
          return this.copyNodeKeyTask(ctx, parentTask)
        }
      },
      {
        title: 'Check network nodes are frozen',
        task: (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.existingNodeAliases, NodeStatusCodes.FREEZE_COMPLETE)
        }
      },
      {
        title: 'Get node logs and configs',
        task: async (ctx: Context) => {
          await helpers.getNodeLogs(this.k8, ctx.config.namespace)
        }
      },
      {
        title: 'Deploy new network node',
        task: async (ctx: Context) => {
          await this.chartUpdateTask(ctx)
        }
      },
      {
        title: 'Kill nodes to pick up updated configMaps',
        task: async (ctx: Context) => {
          for (const service of ctx.config.serviceMap.values()) {
            await this.k8.kubeClient.deleteNamespacedPod(service.nodePodName, ctx.config.namespace, undefined, undefined, 1)
          }
        }
      },
      {
        title: 'Check node pods are running',
        task: (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          return this.checkPodRunningTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Fetch platform software into all network nodes',
        task:
          async (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
            const config = ctx.config

            config.serviceMap = await this.accountManager.getNodeServiceMap(
              config.namespace)
            config.podNames[config.nodeAlias] = config.serviceMap.get(config.nodeAlias).nodePodName as PodName

            return this.fetchLocalOrReleasedPlatformSoftware(config.allNodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
          }
      },
      {
        title: 'Download last state from an existing node',
        task: async (ctx: Context) => {
          const config = ctx.config
          const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeAliases[0])
          const upgradeDirectory = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/0/123`
          // zip the contents of the newest folder on node1 within /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/
          const zipFileName = await this.k8.execContainer(node1FullyQualifiedPodName, constants.ROOT_CONTAINER,
            ['bash', '-c', `cd ${upgradeDirectory} && mapfile -t states < <(ls -1t .) && jar cf "\${states[0]}.zip" -C "\${states[0]}" . && echo -n \${states[0]}.zip`])

          await this.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${upgradeDirectory}/${zipFileName}`, config.stagingDir)
          config.lastStateZipPath = path.join(config.stagingDir, zipFileName)
        }
      },
      {
        title: 'Upload last saved state to new network node',
        task:
            async (ctx: Context) => {
              const config = ctx.config

              const newNodeFullyQualifiedPodName = Templates.renderNetworkPodName(config.nodeAlias)
              const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias)
              const savedStateDir = (config.lastStateZipPath.match(/\/(\d+)\.zip$/))[1]
              const savedStatePath = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/${nodeId}/123/${savedStateDir}`
              await this.k8.execContainer(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `mkdir -p ${savedStatePath}`])
              await this.k8.copyTo(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, config.lastStateZipPath, savedStatePath)
              await this.platformInstaller.setPathPermission(newNodeFullyQualifiedPodName, constants.HEDERA_HAPI_PATH)
              await this.k8.execContainer(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `cd ${savedStatePath} && jar xf ${path.basename(config.lastStateZipPath)} && rm -f ${path.basename(config.lastStateZipPath)}`])
            }
      },
      {
        title: 'Setup new network node',
        task: (ctx: Context, parentTask: ListrTaskWrapper<any, any, any>) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Start network nodes',
        task: (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          const config = ctx.config
          return this.startNetworkNodesTask(task, config.podNames, config.allNodeAliases)
        }
      },
      {
        title: 'Enable port forwarding for JVM debugger',
        task: async (ctx: Context) => {
          await this.enableJVMPortForwarding(ctx.config.debugNodeAlias)
        },
        skip: (ctx: Context) => !ctx.config.debugNodeAlias
      },
      {
        title: 'Check all nodes are ACTIVE',
        task: (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Check all node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          return this.checkNodesProxiesTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Stake new node',
        task: async (ctx: Context) => {
          const config = ctx.config
          await this.addStake(config.namespace, ctx.newNode.accountId, config.nodeAlias)
        }
      },
      {
        title: 'Trigger stake weight calculate',
        task: async (ctx: Context) => {
          const config = ctx.config
          await this.triggerStakeCalculation(config)
        }
      },
      {
        title: 'Finalize',
        task: () => {
          // reset flags so that keys are not regenerated later
          this.configManager.setFlag(flags.generateGossipKeys, false)
          this.configManager.setFlag(flags.generateTlsKeys, false)
          this.configManager.persist()
        }
      }
    ]
  }

  async addPrepare (argv: any) {
    const prepareTasks = this.getAddPrepareTasks(argv)
    const tasks = new Listr([
      // @ts-ignore
      ...prepareTasks,
      // @ts-ignore
      this.saveContextDataTask(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addSaveContextParser)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      this.logger.error(`Error in setting up nodes: ${e.message}`, e)
      throw new SoloError(`Error in setting up nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  async addSubmitTransactions (argv: any) {
    const transactionTasks = this.getAddTransactionTasks(argv)
    const tasks = new Listr([
      this.addInitializeTask(argv),
      this.loadContextDataTask(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
      // @ts-ignore
      ...transactionTasks
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      this.logger.error(`Error in submitting transactions to node: ${e.message}`, e)
      throw new SoloError(`Error in submitting transactions to up node: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  async addExecute (argv: any) {
    const executeTasks = this.getAddExecuteTasks(argv)
    // @ts-ignore
    const tasks = new Listr([
      this.addInitializeTask(argv),
      // @ts-ignore
      this.tasks.identifyExistingNodes(),
      this.loadContextDataTask(argv, NodeCommand.ADD_CONTEXT_FILE, helpers.addLoadContextParser),
      // @ts-ignore
      ...executeTasks
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      this.logger.error(`Error in starting up nodes: ${e.message}`, e)
      throw new SoloError(`Error in setting up nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  async add (argv: any) {
    const prepareTasks = this.getAddPrepareTasks(argv)
    const transactionTasks = this.getAddTransactionTasks(argv)
    const executeTasks = this.getAddExecuteTasks(argv)

    // @ts-ignore
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
    } catch (e: Error | any) {
      this.logger.error(`Error in adding nodes: ${e.message}`, e)
      throw new SoloError(`Error in adding nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  async prepareUpgrade (argv: any) {
    argv = helpers.addFlagsToArgv(argv, flags.DEFAULT_FLAGS)
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

  async freezeUpgrade (argv: any) {
    argv = helpers.addFlagsToArgv(argv, flags.DEFAULT_FLAGS)
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

  async downloadGeneratedFiles (argv: any) {
    argv = helpers.addFlagsToArgv(argv, flags.DEFAULT_FLAGS)
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

  async enableJVMPortForwarding (nodeAlias: NodeAlias) {
    const podName = `network-${nodeAlias}-0` as PodName
    this.logger.debug(`Enable port forwarding for JVM debugger on pod ${podName}`)
    await this.k8.portForward(podName, constants.JVM_DEBUG_PORT, constants.JVM_DEBUG_PORT)
  }

  startNodes (podNames: Record<NodeAlias, PodName>, nodeAliases: NodeAliases, subTasks: any[]) {
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
  /** Return Yargs command definition for 'node' command */
  getCommandDefinition (): { command: string; desc: string; builder: Function } {
    return {
      command: 'node',
      desc: 'Manage Hedera platform node in solo network',
      builder: (yargs: any) => {
        return yargs
          .command({
            command: 'setup',
            desc: 'Setup node with a specific version of Hedera platform',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.SETUP_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node setup\' ===')
              this.logger.debug(argv)

              this.setup(argv).then(r => {
                this.logger.debug('==== Finished running `node setup`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'start',
            desc: 'Start a node',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.START_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node start\' ===')
              this.logger.debug(argv)

              this.start(argv).then(r => {
                this.logger.debug('==== Finished running `node start`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'stop',
            desc: 'Stop a node',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.STOP_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node stop\' ===')
              this.logger.debug(argv)

              this.stop(argv).then(r => {
                this.logger.debug('==== Finished running `node stop`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'keys',
            desc: 'Generate node keys',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.KEYS_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node keys\' ===')
              this.logger.debug(argv)

              this.keys(argv).then(r => {
                this.logger.debug('==== Finished running `node keys`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'refresh',
            desc: 'Reset and restart a node',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.REFRESH_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node refresh\' ===')
              this.logger.debug(argv)

              this.refresh(argv).then(r => {
                this.logger.debug('==== Finished running `node refresh`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'logs',
            desc: 'Download application logs from the network nodes and stores them in <SOLO_LOGS_DIR>/<namespace>/<podName>/ directory',
            builder: (y: any) => flags.setCommandFlags(y,
              flags.nodeAliasesUnparsed
            ),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node logs\' ===')
              this.logger.debug(argv)

              this.logs(argv).then(r => {
                this.logger.debug('==== Finished running `node logs`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'add',
            desc: 'Adds a node with a specific version of Hedera platform',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.ADD_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node add\' ===')
              this.logger.debug(argv)

              this.add(argv).then(r => {
                this.logger.debug('==== Finished running `node add`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'add-prepare',
            desc: 'Prepares the addition of a node with a specific version of Hedera platform',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.ADD_PREPARE_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node add-prepare\' ===')
              this.logger.debug(argv)

              this.addPrepare(argv).then(r => {
                this.logger.debug('==== Finished running `node add`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'add-submit-transactions',
            desc: 'Submits NodeCreateTransaction and Upgrade transactions to the network nodes',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.ADD_SUBMIT_TRANSACTIONS_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node add-submit-transactions\' ===')
              this.logger.debug(argv)

              this.addSubmitTransactions(argv).then(r => {
                this.logger.debug('==== Finished running `node add`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'add-execute',
            desc: 'Executes the addition of a previously prepared node',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.ADD_EXECUTE_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node add-execute\' ===')
              this.logger.debug(argv)

              this.addExecute(argv).then(r => {
                this.logger.debug('==== Finished running `node add`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'update',
            desc: 'Update a node with a specific version of Hedera platform',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.UPDATE_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node update\' ===')
              this.logger.debug(argv)

              this.update(argv).then(r => {
                this.logger.debug('==== Finished running `node update`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'delete',
            desc: 'Delete a node with a specific version of Hedera platform',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.DELETE_FLAGS_LIST.concat(flags.nodeAlias)),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node delete\' ===')
              this.logger.debug(argv)

              this.delete(argv).then(r => {
                this.logger.debug('==== Finished running `node delete`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'delete-prepare',
            desc: 'Prepares the deletion of a node with a specific version of Hedera platform',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.DELETE_PREPARE_FLAGS_LIST.concat(flags.nodeAlias)),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node delete-prepare\' ===')
              this.logger.debug(argv)

              this.deletePrepare(argv).then(r => {
                this.logger.debug('==== Finished running `node delete-prepare`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'delete-submit-transactions',
            desc: 'Submits transactions to the network nodes for deleting a node',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.DELETE_SUBMIT_TRANSACTIONS_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node delete-submit-transactions\' ===')
              this.logger.debug(argv)

              this.deleteSubmitTransactions(argv).then(r => {
                this.logger.debug('==== Finished running `node delete-submit-transactions`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command({
            command: 'delete-execute',
            desc: 'Executes the deletion of a previously prepared node',
            builder: (y: any) => flags.setCommandFlags(y, ...NodeCommand.DELETE_EXECUTE_FLAGS_LIST),
            handler: (argv: any) => {
              this.logger.debug('==== Running \'node delete-execute\' ===')
              this.logger.debug(argv)

              this.deleteExecute(argv).then(r => {
                this.logger.debug('==== Finished running `node delete-execute`====')
                if (!r) process.exit(1)
              }).catch(err => {
                this.logger.showUserError(err)
                process.exit(1)
              })
            }
          })
          .command(new YargsCommand({
            command: 'prepare-upgrade',
            description: 'Prepare the network for a Freeze Upgrade operation',
            commandDef: this,
            handler: 'prepareUpgrade'
          }, flags.DEFAULT_FLAGS))
          .command(new YargsCommand({
            command: 'freeze-upgrade',
            description: 'Performs a Freeze Upgrade operation with on the network after it has been prepared with prepare-upgrade',
            commandDef: this,
            handler: 'freezeUpgrade'
          }, flags.DEFAULT_FLAGS))
          .command(new YargsCommand({
            command: 'download-generated-files',
            description: 'Downloads the generated files from an existing node',
            commandDef: this,
            handler: 'downloadGeneratedFiles'
          }, flags.DEFAULT_FLAGS))
          .demandCommand(1, 'Select a node command')
      }
    }
  }

  async update (argv: any) {
    interface NodeUpdateConfigClass {
      app: string
      cacheDir: string
      chartDirectory: string
      devMode: boolean
      debugNodeAlias: NodeAlias
      endpointType: string
      soloChartVersion: string
      gossipEndpoints: string
      gossipPrivateKey: string
      gossipPublicKey: string
      grpcEndpoints: string
      localBuildPath: string
      namespace: string
      newAccountNumber: string
      newAdminKey: string
      nodeAlias: NodeAlias
      releaseTag: string
      tlsPrivateKey: string
      tlsPublicKey: string
      adminKey: PrivateKey
      allNodeAliases: NodeAliases
      chartPath: string
      existingNodeAliases: NodeAliases
      freezeAdminPrivateKey: string
      keysDir: string
      nodeClient: any
      podNames: Record<NodeAlias, PodName>
      serviceMap: Map<string, NetworkNodeServices>
      stagingDir: string
      stagingKeysDir: string
      treasuryKey: PrivateKey
      getUnusedConfigs: () => string[]
      curDate: Date
    }

    interface Context {
      config: NodeUpdateConfigClass
      gossipEndpoints: ServiceEndpoint[]
      grpcServiceEndpoints: ServiceEndpoint[]
    }

    const tasks = new Listr<Context>([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          this.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.app,
            flags.chartDirectory,
            flags.devMode,
            flags.debugNodeAlias,
            flags.endpointType,
            flags.force,
            flags.soloChartVersion,
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

          await prompts.execute(task, this.configManager, NodeCommand.UPDATE_FLAGS_LIST)

          // create a config object for subsequent steps
          const config = this.getConfig(NodeCommand.UPDATE_CONFIGS_NAME, NodeCommand.UPDATE_FLAGS_LIST,
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
            ]) as NodeUpdateConfigClass

          config.curDate = new Date()
          config.existingNodeAliases = []

          await this.initializeSetup(config, this.k8)

          // set config in the context for later tasks to use
          ctx.config = config

          ctx.config.chartPath = await this.prepareChartPath(ctx.config.chartDirectory,
            constants.SOLO_TESTING_CHART, constants.SOLO_DEPLOYMENT_CHART)

          // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
          ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace)

          const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace)
          config.freezeAdminPrivateKey = accountKeys.privateKey

          const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace)
          const treasuryAccountPrivateKey = treasuryAccount.privateKey
          config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey)

          this.logger.debug('Initialized config', { config })
        }
      },
      // @ts-ignore
      this.tasks.identifyExistingNodes(),
      {
        title: 'Prepare gossip endpoints',
        task: (ctx) => {
          const config = ctx.config
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
          const config = ctx.config
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
      // @ts-ignore
      this.tasks.loadAdminKey(),
      // @ts-ignore
      this.tasks.prepareUpgradeZip(),
      // @ts-ignore
      this.tasks.checkExistingNodesStakedAmount(),
      {
        title: 'Send node update transaction',
        task: async (ctx) => {
          const config = ctx.config

          const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias) - 1
          this.logger.info(`nodeId: ${nodeId}`)
          this.logger.info(`config.newAccountNumber: ${config.newAccountNumber}`)

          try {
            const nodeUpdateTx = new NodeUpdateTransaction().setNodeId(nodeId)

            if (config.tlsPublicKey && config.tlsPrivateKey) {
              this.logger.info(`config.tlsPublicKey: ${config.tlsPublicKey}`)
              const tlsCertDer = await this.loadPermCertificate(config.tlsPublicKey)
              const tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest()
              nodeUpdateTx.setCertificateHash(tlsCertHash)

              const publicKeyFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias)
              const privateKeyFile = Templates.renderTLSPemPrivateKeyFile(config.nodeAlias)
              renameAndCopyFile(config.tlsPublicKey, publicKeyFile, config.keysDir)
              renameAndCopyFile(config.tlsPrivateKey, privateKeyFile, config.keysDir)
            }

            if (config.gossipPublicKey && config.gossipPrivateKey) {
              this.logger.info(`config.gossipPublicKey: ${config.gossipPublicKey}`)
              const signingCertDer = this.loadPermCertificate(config.gossipPublicKey)
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
            nodeUpdateTx.freezeWith(config.nodeClient)

            // config.adminKey contains the original key, needed to sign the transaction
            if (config.newAdminKey) {
              await nodeUpdateTx.sign(parsedNewKey)
            }
            const signedTx = await nodeUpdateTx.sign(config.adminKey)
            const txResp = await signedTx.execute(config.nodeClient)
            const nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient)
            this.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`)
          } catch (e: Error | any) {
            this.logger.error(`Error updating node to network: ${e.message}`, e)
            this.logger.error(e.stack)
            throw new SoloError(`Error updating node to network: ${e.message}`, e)
          }
        }
      },
      // @ts-ignore
      this.tasks.sendPrepareUpgradeTransaction(),
      // @ts-ignore
      this.tasks.downloadNodeGeneratedFiles(),
      // @ts-ignore
      this.tasks.sendFreezeUpgradeTransaction(),
      {
        title: 'Prepare staging directory',
        task: (ctx, parentTask) => {
          const config = ctx.config
          return this.prepareStagingTask(ctx, parentTask, config.keysDir, config.stagingKeysDir, config.allNodeAliases)
        }
      },
      {
        title: 'Copy node keys to secrets',
        task: (ctx, parentTask) => {
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
          const config = ctx.config
          await helpers.getNodeLogs(this.k8, config.namespace)
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
          const config = ctx.config
          // the updated node will have a new pod ID if its account ID changed which is a label
          config.serviceMap = await this.accountManager.getNodeServiceMap(
            config.namespace)
          for (const service of config.serviceMap.values()) {
            await this.k8.kubeClient.deleteNamespacedPod(service.nodePodName, config.namespace, undefined, undefined, 1)
          }
          this.logger.info('sleep for 15 seconds to give time for pods to finish terminating')
          await sleep(15 * SECONDS)

          // again, the pod names will change after the pods are killed
          config.serviceMap = await this.accountManager.getNodeServiceMap(config.namespace)
          config.podNames = {}
          for (const service of config.serviceMap.values()) {
            config.podNames[service.nodeAlias] = service.nodePodName
          }
        }
      },
      {
        title: 'Check node pods are running',
        task: (ctx, task) => {
          return this.checkPodRunningTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Fetch platform software into network nodes',
        task: (ctx, task) => {
          const { config: { allNodeAliases, podNames, releaseTag, localBuildPath} } = ctx
          return this.fetchLocalOrReleasedPlatformSoftware(allNodeAliases, podNames, releaseTag, task, localBuildPath)
        }
      },
      {
        title: 'Setup network nodes',
        task: (ctx, parentTask) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Start network nodes',
        task: (ctx, task) => {
          return this.startNetworkNodesTask(task, ctx.config.podNames, ctx.config.allNodeAliases)
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
        task: (ctx, task) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Check all node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: (ctx, task) => {
          return this.checkNodesProxiesTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Trigger stake weight calculate',
        task: async (ctx) => {
          await this.triggerStakeCalculation(ctx.config)
        }
      },
      {
        title: 'Finalize',
        task: () => {
          // reset flags so that keys are not regenerated later
          this.configManager.setFlag(flags.generateGossipKeys, false)
          this.configManager.setFlag(flags.generateTlsKeys, false)
          this.configManager.persist()
        }
      }
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      this.logger.error(`Error in updating nodes: ${e.message}`, e)
      this.logger.error(e.stack)
      throw new SoloError(`Error in updating nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  deleteInitializeTask (argv: any) {
    interface Context {
      config: NodeDeleteConfigClass
    }

    return {
      title: 'Initialize',
      task: async (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
        this.configManager.update(argv)

        // disable the prompts that we don't want to prompt the user for
        prompts.disablePrompts([
          flags.app,
          flags.chainId,
          flags.chartDirectory,
          flags.devMode,
          flags.debugNodeAlias,
          flags.endpointType,
          flags.force,
          flags.soloChartVersion,
          flags.localBuildPath
        ])

        await prompts.execute(task, this.configManager, NodeCommand.DELETE_FLAGS_LIST)

        // create a config object for subsequent steps
        const config = this.getConfig(NodeCommand.DELETE_CONFIGS_NAME, NodeCommand.DELETE_FLAGS_LIST,
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
          ]) as NodeDeleteConfigClass

        config.curDate = new Date()
        config.existingNodeAliases = []

        await this.initializeSetup(config, this.k8)

        // set config in the context for later tasks to use
        ctx.config = config

        ctx.config.chartPath = await this.prepareChartPath(ctx.config.chartDirectory,
          constants.SOLO_TESTING_CHART, constants.SOLO_DEPLOYMENT_CHART)

        // initialize Node Client with existing network nodes prior to adding the new node which isn't functioning, yet
        ctx.config.nodeClient = await this.accountManager.loadNodeClient(ctx.config.namespace)

        const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace)
        config.freezeAdminPrivateKey = accountKeys.privateKey

        const treasuryAccount = await this.accountManager.getTreasuryAccountKeys(config.namespace)
        const treasuryAccountPrivateKey = treasuryAccount.privateKey
        config.treasuryKey = PrivateKey.fromStringED25519(treasuryAccountPrivateKey)

        this.logger.debug('Initialized config', { config })
      }
    }
  }

  deletePrepareTasks (argv: any) {
    return [
      this.deleteInitializeTask(argv),
      this.tasks.identifyExistingNodes(),
      this.tasks.loadAdminKey(),
      this.tasks.prepareUpgradeZip(),
      this.tasks.checkExistingNodesStakedAmount()
    ]
  }

  deleteExecuteTasks (argv: any) {
    interface Context {
      config: NodeDeleteConfigClass
    }

    return [
      this.tasks.downloadNodeGeneratedFiles(),
      {
        title: 'Prepare staging directory',
        task: (ctx: Context, parentTask: ListrTaskWrapper<any, any, any>) => {
          const { config: { keysDir, stagingKeysDir, existingNodeAliases } } = ctx
          return this.prepareStagingTask(ctx, parentTask, keysDir, stagingKeysDir, existingNodeAliases)
        }
      },
      {
        title: 'Copy node keys to secrets',
        task: (ctx: Context, parentTask: ListrTaskWrapper<any, any, any>) => {
          // remove nodeAlias from existingNodeAliases
          ctx.config.allNodeAliases = ctx.config.existingNodeAliases.filter(nodeAlias => nodeAlias !== ctx.config.nodeAlias)
          return this.copyNodeKeyTask(ctx, parentTask)
        }
      },
      {
        title: 'Check network nodes are frozen',
        task: (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.existingNodeAliases, NodeStatusCodes.FREEZE_COMPLETE)
        }
      },
      {
        title: 'Get node logs and configs',
        task: async (ctx: Context) => {
          await helpers.getNodeLogs(this.k8, ctx.config.namespace)
        }
      },
      {
        title: 'Update chart to use new configMap',
        task: async (ctx: Context) => {
          await this.chartUpdateTask(ctx)
        }
      },
      {
        title: 'Kill nodes to pick up updated configMaps',
        task: async (ctx: Context) => {
          for (const service of ctx.config.serviceMap.values()) {
            await this.k8.kubeClient.deleteNamespacedPod(service.nodePodName, ctx.config.namespace, undefined, undefined, 1)
          }
        }
      },
      {
        title: 'Check node pods are running',
        task: async (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          this.logger.info('sleep 20 seconds to give time for pods to come up after being killed')
          await sleep(20 * SECONDS)
          return this.checkPodRunningTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Fetch platform software into all network nodes',
        task: async (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          const config = ctx.config
          config.serviceMap = await this.accountManager.getNodeServiceMap(
            config.namespace)
          config.podNames[config.nodeAlias] = config.serviceMap.get(
            config.nodeAlias).nodePodName
          return this.fetchLocalOrReleasedPlatformSoftware(config.allNodeAliases, config.podNames, config.releaseTag, task, config.localBuildPath)
        }
      },
      {
        title: 'Setup network nodes',
        task: (ctx: Context, parentTask:ListrTaskWrapper<any, any, any>) => {
          return this.setupNodesTask(ctx, parentTask, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Start network nodes',
        task: (ctx: Context, task:ListrTaskWrapper<any, any, any>) => {
          return this.startNetworkNodesTask(task, ctx.config.podNames, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Enable port forwarding for JVM debugger',
        task: async (ctx: Context) => {
          await this.enableJVMPortForwarding(ctx.config.debugNodeAlias)
        },
        skip: (ctx: Context) => !ctx.config.debugNodeAlias
      },
      {
        title: 'Check all nodes are ACTIVE',
        task: (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          return this.checkNodeActivenessTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Check all node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: (ctx: Context, task: ListrTaskWrapper<any, any, any>) => {
          return this.checkNodesProxiesTask(ctx, task, ctx.config.allNodeAliases)
        }
      },
      {
        title: 'Trigger stake weight calculate',
        task: async (ctx: Context) => {
          await this.triggerStakeCalculation(ctx.config)
        }
      },
      {
        title: 'Finalize',
        task: () => {
          // reset flags so that keys are not regenerated later
          this.configManager.setFlag(flags.generateGossipKeys, false)
          this.configManager.setFlag(flags.generateTlsKeys, false)
          this.configManager.persist()
        }
      }
    ]
  }

  deleteSubmitTransactionsTasks (argv: any) {
    interface Context {
      config: NodeDeleteConfigClass
    }

    return [
      {
        title: 'Send node delete transaction',
        task: async (ctx: Context) => {
          const config = ctx.config

          try {
            const accountMap = getNodeAccountMap(config.existingNodeAliases)
            const deleteAccountId = accountMap.get(config.nodeAlias)
            this.logger.debug(`Deleting node: ${config.nodeAlias} with account: ${deleteAccountId}`)
            const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias) - 1
            const nodeDeleteTx = new NodeDeleteTransaction()
              .setNodeId(nodeId)
              .freezeWith(config.nodeClient)

            const signedTx = await nodeDeleteTx.sign(config.adminKey)
            const txResp = await signedTx.execute(config.nodeClient)
            const nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient)
            this.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`)
          } catch (e: Error | any) {
            this.logger.error(`Error deleting node from network: ${e.message}`, e)
            throw new SoloError(`Error deleting node from network: ${e.message}`, e)
          }
        }
      },
      this.tasks.sendPrepareUpgradeTransaction(),
      this.tasks.sendFreezeUpgradeTransaction()
    ]
  }

  async deletePrepare (argv: any) {
    const tasks = new Listr([
      // @ts-ignore
      ...this.deletePrepareTasks(argv),
      // @ts-ignore
      this.saveContextDataTask(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteSaveContextParser)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      this.logger.error(`Error in deleting nodes: ${e.message}`, e)
      throw new SoloError(`Error in deleting nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  async deleteExecute (argv: any) {
    const tasks = new Listr([
      this.deleteInitializeTask(argv),
      this.loadContextDataTask(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
      // @ts-ignore
      ...this.deleteExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      this.logger.error(`Error in deleting nodes: ${e.message}`, e)
      throw new SoloError(`Error in deleting nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  async deleteSubmitTransactions (argv: any) {
    const tasks = new Listr([
      this.deleteInitializeTask(argv),
      this.loadContextDataTask(argv, NodeCommand.DELETE_CONTEXT_FILE, helpers.deleteLoadContextParser),
      // @ts-ignore
      ...this.deleteSubmitTransactionsTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      this.logger.error(`Error in deleting nodes: ${e.message}`, e)
      throw new SoloError(`Error in deleting nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }

  async delete (argv: any) {
    // @ts-ignore
    const tasks = new Listr([
      ...this.deletePrepareTasks(argv),
      ...this.deleteSubmitTransactionsTasks(argv),
      ...this.deleteExecuteTasks(argv)
    ], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e: Error | any) {
      this.logger.error(`Error in deleting nodes: ${e.message}`, e)
      throw new SoloError(`Error in deleting nodes: ${e.message}`, e)
    } finally {
      await this.close()
    }

    return true
  }
}
