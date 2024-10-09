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
import { constants, Templates, Task, Zippy } from '../../core/index.mjs'
import {
  DEFAULT_NETWORK_NODE_NAME,
  FREEZE_ADMIN_ACCOUNT, HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
  LOCAL_HOST,
  TREASURY_ACCOUNT_ID
} from '../../core/constants.mjs'
import {
  AccountBalanceQuery, AccountId, AccountUpdateTransaction,
  FileAppendTransaction,
  FileUpdateTransaction,
  FreezeTransaction,
  FreezeType, NodeCreateTransaction, NodeDeleteTransaction, NodeUpdateTransaction, PrivateKey,
  Timestamp
} from '@hashgraph/sdk'
import { SoloError, IllegalArgumentError, MissingArgumentError } from '../../core/errors.mjs'
import * as prompts from '../prompts.mjs'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import {
  addDebugOptions,
  getNodeAccountMap,
  getNodeLogs,
  prepareEndpoints,
  renameAndCopyFile,
  sleep,
  splitFlagInput
} from '../../core/helpers.mjs'
import chalk from 'chalk'
import * as flags from '../flags.mjs'
import {NodeStatusCodes, NodeStatusEnums} from "../../core/enumerations.mjs";
import * as x509 from "@peculiar/x509";

export class NodeCommandTasks {
  /**
     * @param {{logger: Logger, accountManager: AccountManager, configManager: ConfigManager,
     * platformInstaller: PlatformInstaller, k8: K8, keyManager: accountManager, profileManager: ProfileManager,
     * parent: NodeCommand, chartManager: ChartManager }} opts
     */
  constructor (opts) {
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required')
    if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required')
    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required')
    if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)
    if (!opts || !opts.keyManager) throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager)
    if (!opts || !opts.profileManager) throw new IllegalArgumentError('An instance of ProfileManager is required', opts.profileManager)

    this.accountManager = opts.accountManager
    this.configManager = opts.configManager
    this.logger = opts.logger
    this.k8 = /** @type {K8} **/ opts.k8
    this.platformInstaller = opts.platformInstaller
    this.profileManager = opts.profileManager
    this.keyManager = opts.keyManager
    this.chartManager = opts.chartManager

    this.prepareValuesFiles = opts.parent.prepareValuesFiles.bind(opts.parent)
  }

  async _prepareUpgradeZip (stagingDir) {
    // we build a mock upgrade.zip file as we really don't need to upgrade the network
    // also the platform zip file is ~80Mb in size requiring a lot of transactions since the max
    // transaction size is 6Kb and in practice we need to send the file as 4Kb chunks.
    // Note however that in DAB phase-2, we won't need to trigger this fake upgrade process
    const zipper = new Zippy(this.logger)
    const upgradeConfigDir = path.join(stagingDir, 'mock-upgrade', 'data', 'config')
    if (!fs.existsSync(upgradeConfigDir)) {
      fs.mkdirSync(upgradeConfigDir, { recursive: true })
    }

    // bump field hedera.config.version
    const fileBytes = fs.readFileSync(path.join(stagingDir, 'templates', 'application.properties'))
    const lines = fileBytes.toString().split('\n')
    const newLines = []
    for (let line of lines) {
      line = line.trim()
      const parts = line.split('=')
      if (parts.length === 2) {
        if (parts[0] === 'hedera.config.version') {
          let version = parseInt(parts[1])
          line = `hedera.config.version=${++version}`
        }
        newLines.push(line)
      }
    }
    fs.writeFileSync(path.join(upgradeConfigDir, 'application.properties'), newLines.join('\n'))

    return await zipper.zip(path.join(stagingDir, 'mock-upgrade'), path.join(stagingDir, 'mock-upgrade.zip'))
  }

  /**
   * @param {string} upgradeZipFile
   * @param nodeClient
   * @returns {Promise<string>}
   */
  async _uploadUpgradeZip (upgradeZipFile, nodeClient) {
    // get byte value of the zip file
    const zipBytes = fs.readFileSync(upgradeZipFile)
    const zipHash = crypto.createHash('sha384').update(zipBytes).digest('hex')
    this.logger.debug(`loaded upgrade zip file [ zipHash = ${zipHash} zipBytes.length = ${zipBytes.length}, zipPath = ${upgradeZipFile}]`)

    // create a file upload transaction to upload file to the network
    try {
      let start = 0

      while (start < zipBytes.length) {
        const zipBytesChunk = new Uint8Array(zipBytes.subarray(start, constants.UPGRADE_FILE_CHUNK_SIZE))
        let fileTransaction = null

        if (start === 0) {
          fileTransaction = new FileUpdateTransaction()
            .setFileId(constants.UPGRADE_FILE_ID)
            .setContents(zipBytesChunk)
        } else {
          fileTransaction = new FileAppendTransaction()
            .setFileId(constants.UPGRADE_FILE_ID)
            .setContents(zipBytesChunk)
        }
        const resp = await fileTransaction.execute(nodeClient)
        const receipt = await resp.getReceipt(nodeClient)
        this.logger.debug(`updated file ${constants.UPGRADE_FILE_ID} [chunkSize= ${zipBytesChunk.length}, txReceipt = ${receipt.toString()}]`)

        start += constants.UPGRADE_FILE_CHUNK_SIZE
      }

      return zipHash
    } catch (e) {
      throw new SoloError(`failed to upload build.zip file: ${e.message}`, e)
    }
  }

  /**
   * @param {NodeAliases} nodeAliases
   * @param {Object} podNames
   * @param {TaskWrapper} task
   * @param {string} localBuildPath
   * @returns {Listr<*, *, *>}
   */
  _uploadPlatformSoftware (nodeAliases, podNames, task, localBuildPath) {
    const subTasks = []

    this.logger.debug('no need to fetch, use local build jar files')

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
          await this.k8.copyTo(podName, constants.ROOT_CONTAINER, localDataLibBuildPath, `${constants.HEDERA_HAPI_PATH}`)
          const testJsonFiles = this.configManager.getFlag(flags.appConfig).split(',')
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

  /**
   * @param {NodeAliases} nodeAliases
   * @param {Object} podNames
   * @param {string} releaseTag
   * @param {TaskWrapper} task
   * @param {PlatformInstaller} platformInstaller
   * @returns {Listr<any, any, any>}
   */
_fetchPlatformSoftware (nodeAliases, podNames, releaseTag, task, platformInstaller) {
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

  /**
   * @param {Object} ctx
   * @param {TaskWrapper} task
   * @param {NodeAliases} nodeAliases
   * @param {number} [status]
   * @returns {Listr<any, any, any>}
   */
  _checkNodeActivenessTask (ctx, task, nodeAliases, status = NodeStatusCodes.ACTIVE) {
    const { config: { namespace } } = ctx

    const subTasks = nodeAliases.map((nodeAlias, i) => {
      const reminder = ('debugNodeAlias' in ctx.config && ctx.config.debugNodeAlias === nodeAlias) ? 'Please attach JVM debugger now.' : ''
      const title = `Check network pod: ${chalk.yellow(nodeAlias)} ${chalk.red(reminder)}`

      const subTask = async (ctx, task) => {
        ctx.config.podNames[nodeAlias] = await this._checkNetworkNodeActiveness(namespace, nodeAlias, task, title, i, status)
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
  async _checkNetworkNodeActiveness (namespace, nodeAlias, task, title, index,
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
   * Return task for check if node proxies are ready
   * @param {any} ctx
   * @param {TaskWrapper} task
   * @param {NodeAliases} nodeAliases
   * @returns {*}
   */
  _checkNodesProxiesTask (ctx, task, nodeAliases) {
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
   *
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   * @param generateMultiple boolean
   * @returns {Task}
   * @private
   */
  _generateGossipKeys(generateMultiple) {
    return new Task('Generate gossip keys', async (ctx, task) => {
      const config = ctx.config
      const nodeAliases = generateMultiple ? config.nodeAliases : [config.nodeAlias]
      const subTasks = this.keyManager.taskGenerateGossipKeys(this.keytoolDepManager, nodeAliases, config.keysDir, config.curDate)
      // set up the sub-tasks
      return task.newListr(subTasks, {
        concurrent: false,
        rendererOptions: {
          collapseSubtasks: false,
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
        }
      })
    }, (ctx) => !ctx.config.generateGossipKeys)
  }

  /**
   *
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   * @param generateMultiple boolean
   * @returns {Task}
   * @private
   */
  _generateGrpcTlsKeys(generateMultiple) {
    return new Task('Generate gRPC TLS Keys', async (ctx, task) => {
      const config = ctx.config
      const nodeAliases = generateMultiple ? config.nodeAliases : [config.nodeAlias]
      const subTasks = this.keyManager.taskGenerateTLSKeys(nodeAliases, config.keysDir, config.curDate)
      // set up the sub-tasks
      return task.newListr(subTasks, {
        concurrent: true,
        rendererOptions: {
          collapseSubtasks: false,
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
        }
      })
    }, (ctx) => !ctx.config.generateTlsKeys)
  }

  _loadPermCertificate (certFullPath) {
    const certPem = fs.readFileSync(certFullPath).toString()
    const decodedDers = x509.PemConverter.decode(certPem)
    if (!decodedDers || decodedDers.length === 0) {
      throw new SoloError('unable to load perm key: ' + certFullPath)
    }
    return (new Uint8Array(decodedDers[0]))
  }

  /**
   * @param {string} namespace
   * @param {string} accountId
   * @param {NodeAlias} nodeAlias
   * @returns {Promise<void>}
   */
  async _addStake (namespace, accountId, nodeAlias) {
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

  prepareUpgradeZip () {
    return new Task('Prepare upgrade zip file for node upgrade process', async (ctx, task) => {
      const config = ctx.config
      ctx.upgradeZipFile = await this._prepareUpgradeZip(config.stagingDir)
      ctx.upgradeZipHash = await this._uploadUpgradeZip(ctx.upgradeZipFile, config.nodeClient)
    })
  }

  loadAdminKey () {
    return new Task('Load node admin key', (ctx, task) => {
      const config = ctx.config
      config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY)
    })
  }

  checkExistingNodesStakedAmount () {
    return new Task('Check existing nodes staked amount', async (ctx, task) => {
      const config = ctx.config

      // Transfer some hbar to the node for staking purpose
      const accountMap = getNodeAccountMap(config.existingNodeAliases)
      for (const nodeAlias of config.existingNodeAliases) {
        const accountId = accountMap.get(nodeAlias)
        await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, 1)
      }
    })
  }

  /**
   * @returns {Task}
   */
  sendPrepareUpgradeTransaction () {
    return new Task('Send prepare upgrade transaction', async (ctx, task) => {
      const { upgradeZipHash } = ctx
      const { nodeClient, freezeAdminPrivateKey } = ctx.config
      try {
        // transfer some tiny amount to the freeze admin account
        await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, FREEZE_ADMIN_ACCOUNT, 100000)

        // query the balance
        const balance = await new AccountBalanceQuery()
          .setAccountId(FREEZE_ADMIN_ACCOUNT)
          .execute(nodeClient)
        this.logger.debug(`Freeze admin account balance: ${balance.hbars}`)

        // set operator of freeze transaction as freeze admin account
        nodeClient.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey)

        const prepareUpgradeTx = await new FreezeTransaction()
          .setFreezeType(FreezeType.PrepareUpgrade)
          .setFileId(constants.UPGRADE_FILE_ID)
          .setFileHash(upgradeZipHash)
          .freezeWith(nodeClient)
          .execute(nodeClient)

        const prepareUpgradeReceipt = await prepareUpgradeTx.getReceipt(nodeClient)

        this.logger.debug(
                    `sent prepare upgrade transaction [id: ${prepareUpgradeTx.transactionId.toString()}]`,
                    prepareUpgradeReceipt.status.toString()
        )
      } catch (e) {
        this.logger.error(`Error in prepare upgrade: ${e.message}`, e)
        throw new SoloError(`Error in prepare upgrade: ${e.message}`, e)
      }
    })
  }

  /**
   * @returns {Task}
   */
  sendFreezeUpgradeTransaction () {
    return new Task('Send freeze upgrade transaction', async (ctx, task) => {
      const { upgradeZipHash } = ctx
      const { freezeAdminPrivateKey, nodeClient } = ctx.config
      try {
        const futureDate = new Date()
        this.logger.debug(`Current time: ${futureDate}`)

        futureDate.setTime(futureDate.getTime() + 5000) // 5 seconds in the future
        this.logger.debug(`Freeze time: ${futureDate}`)

        nodeClient.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey)
        const freezeUpgradeTx = await new FreezeTransaction()
          .setFreezeType(FreezeType.FreezeUpgrade)
          .setStartTimestamp(Timestamp.fromDate(futureDate))
          .setFileId(constants.UPGRADE_FILE_ID)
          .setFileHash(upgradeZipHash)
          .freezeWith(nodeClient)
          .execute(nodeClient)

        const freezeUpgradeReceipt = await freezeUpgradeTx.getReceipt(nodeClient)
        this.logger.debug(`Upgrade frozen with transaction id: ${freezeUpgradeTx.transactionId.toString()}`,
          freezeUpgradeReceipt.status.toString())
      } catch (e) {
        this.logger.error(`Error in freeze upgrade: ${e.message}`, e)
        throw new SoloError(`Error in freeze upgrade: ${e.message}`, e)
      }
    })
  }

  /**
   * Download generated config files and key files from the network node
   * @returns {Task}
   */
  downloadNodeGeneratedFiles () {
    return new Task('Download generated files from an existing node', async (ctx, task) => {
      const config = ctx.config
      const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeAliases[0])

      // copy the config.txt file from the node1 upgrade directory
      await this.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/config.txt`, config.stagingDir)

      // if directory data/upgrade/current/data/keys does not exist then use data/upgrade/current
      let keyDir = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/keys`
      if (!await this.k8.hasDir(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, keyDir)) {
        keyDir = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`
      }
      const signedKeyFiles = (await this.k8.listDir(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, keyDir)).filter(file => file.name.startsWith(constants.SIGNING_KEY_PREFIX))
      await this.k8.execContainer(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `mkdir -p ${constants.HEDERA_HAPI_PATH}/data/keys_backup && cp -r ${keyDir} ${constants.HEDERA_HAPI_PATH}/data/keys_backup/`])
      for (const signedKeyFile of signedKeyFiles) {
        await this.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${keyDir}/${signedKeyFile.name}`, `${config.keysDir}`)
      }

      if (await this.k8.hasFile(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/application.properties`)) {
        await this.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/application.properties`, `${config.stagingDir}/templates`)
      }
    })
  }

  /**
   * Return task for checking for all network node pods
   * @param {any} ctx
   * @param {TaskWrapper} task
   * @param {string[]} nodeAliases
   * @returns {*}
   */
  taskCheckNetworkNodePods (ctx, task, nodeAliases) {
    if (!ctx.config) {
      ctx.config = {}
    }

    ctx.config.podNames = {}

    const subTasks = []
    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check network pod: ${chalk.yellow(nodeAlias)}`,
        task: async (ctx) => {
          ctx.config.podNames[nodeAlias] = await this.checkNetworkNodePod(ctx.config.namespace, nodeAlias)
        }
      })
    }

    // setup the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {
        collapseSubtasks: false
      }
    })
  }

  /**
   * Check if the network node pod is running
   * @param {string} namespace
   * @param {string} nodeAlias
   * @param {number} [maxAttempts]
   * @param {number} [delay]
   * @returns {Promise<string>}
   */
  async checkNetworkNodePod (namespace, nodeAlias, maxAttempts = 60, delay = 2000) {
    nodeAlias = nodeAlias.trim()
    const podName = Templates.renderNetworkPodName(nodeAlias)

    try {
      await this.k8.waitForPods([constants.POD_PHASE_RUNNING], [
        'solo.hedera.com/type=network-node',
        `solo.hedera.com/node-name=${nodeAlias}`
      ], 1, maxAttempts, delay)

      return podName
    } catch (e) {
      throw new SoloError(`no pod found for nodeAlias: ${nodeAlias}`, e)
    }
  }

  identifyExistingNodes () {
    return new Task('Identify existing network nodes', async (ctx, task) => {
      const config = ctx.config
      config.existingNodeAliases = []
      config.serviceMap = await this.accountManager.getNodeServiceMap(config.namespace)
      for (/** @type {NetworkNodeServices} **/ const networkNodeServices of config.serviceMap.values()) {
        config.existingNodeAliases.push(networkNodeServices.nodeAlias)
      }
      config.allNodeAliases = [...config.existingNodeAliases]
      return this.taskCheckNetworkNodePods(ctx, task, config.existingNodeAliases)
    })
  }

  identifyNetworkPods () {
    return new Task('Identify network pods', (ctx, task) => {
      return this.taskCheckNetworkNodePods(ctx, task, ctx.config.nodeAliases)
    })
  }

  fetchPlatformSoftware () {
    return new Task('Fetch platform software into network nodes', async (ctx, task) => {
      const {nodeAliases, podNames, releaseTag, localBuildPath} = ctx.config

      if (localBuildPath !== '') {
        return this._uploadPlatformSoftware(nodeAliases, podNames, task, localBuildPath)
      } else {
        return this._fetchPlatformSoftware(nodeAliases, podNames, releaseTag, task, this.platformInstaller)
      }
    })
  }

  populateServiceMap () {
    return new Task('Populate serviceMap', async (ctx, task) => {
      ctx.config.serviceMap = await this.accountManager.getNodeServiceMap(
          ctx.config.namespace)
      ctx.config.podNames[ctx.config.nodeAlias] = ctx.config.serviceMap.get(ctx.config.nodeAlias).nodePodName
    })
  }

  /**
   *
   * @param nodeAliasesProperty : string
   * @returns {Task}
   */
  setupNetworkNodes (nodeAliasesProperty) {
    return new Task('Setup network nodes', async (ctx, task) => {
      const subTasks = []
      for (const nodeAlias of ctx.config[nodeAliasesProperty]) {
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
    })
  }

  prepareStagingDirectory (nodeAliasesProperty) {
    return new Task('Prepare staging directory', async (ctx, task) => {
      const config = ctx.config
      const nodeAliases = config[nodeAliasesProperty]
      const subTasks = [
        {
          title: 'Copy Gossip keys to staging',
          task: async () => {
            await this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, nodeAliases)
          }
        },
        {
          title: 'Copy gRPC TLS keys to staging',
          task: async () => {
            for (const nodeAlias of nodeAliases) {
              const tlsKeyFiles = this.keyManager.prepareTLSKeyFilePaths(nodeAlias, config.keysDir)
              await this.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir)
            }
          }
        }
      ]
      return task.newListr(subTasks, {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
      })

    })
  }

  startNodes (nodeAliasesProperty) {
    return new Task('Starting nodes', async (ctx, task) => {
      const config = ctx.config
      const nodeAliases = config[nodeAliasesProperty]

      const subTasks = []
      // ctx.config.allNodeAliases = ctx.config.existingNodeAliases

      for (const nodeAlias of nodeAliases) {
        const podName = config.podNames[nodeAlias]
        subTasks.push({
          title: `Start node: ${chalk.yellow(nodeAlias)}`,
          task: async () => {
            await this.k8.execContainer(podName, constants.ROOT_CONTAINER, ['systemctl', 'restart', 'network-node'])
          }
        })
      }


      // set up the sub-tasks
      return task.newListr(subTasks, {
        concurrent: true,
        rendererOptions: {
          collapseSubtasks: false,
          timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
        }
      })
    })
  }

  enablePortForwarding () {
    return new Task('Enable port forwarding for JVM debugger', async (ctx, task) => {
      const podName = `network-${ctx.config.debugNodeAlias}-0`
      this.logger.debug(`Enable port forwarding for JVM debugger on pod ${podName}`)
      await this.k8.portForward(podName, constants.JVM_DEBUG_PORT, constants.JVM_DEBUG_PORT)
    }, (ctx) => !ctx.config.debugNodeAlias)
  }

  checkAllNodesAreActive (nodeAliasesProperty) {
    return new Task('Check all nodes are ACTIVE', async (ctx, task) => {
      return this._checkNodeActivenessTask(ctx, task, ctx.config[nodeAliasesProperty])
    })
  }

  checkAllNodesAreFrozen (nodeAliasesProperty) {
    return new Task('Check all nodes are ACTIVE', async (ctx, task) => {
      return this._checkNodeActivenessTask(ctx, task, ctx.config[nodeAliasesProperty], NodeStatusCodes.FREEZE_COMPLETE)
    })
  }

  checkNodeProxiesAreActive (skip) {
    return new Task('Check node proxies are ACTIVE', async (ctx, task) => {
      // this is more reliable than checking the nodes logs for ACTIVE, as the
      // logs will have a lot of white noise from being behind
      return this._checkNodesProxiesTask(ctx, task, ctx.config.nodeAliases)
    }, skip)
  }

  checkAllNodeProxiesAreActive () {
    return new Task('Check all node proxies are ACTIVE', async (ctx, task) => {
      // this is more reliable than checking the nodes logs for ACTIVE, as the
      // logs will have a lot of white noise from being behind
      return this._checkNodesProxiesTask(ctx, task, ctx.config.allNodeAliases)
    })
  }

  // Update account manager and transfer hbar for staking purpose
  triggerStakeWeightCalculate () {
    return new Task('Trigger stake weight calculate', async (ctx, task) => {
      const config = ctx.config
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

    })
  }

  addNodeStakes () {
    return new Task('Add node stakes', async (ctx, task) => {
      if (ctx.config.app === '' || ctx.config.app === constants.HEDERA_APP_NAME) {
        const subTasks = []
        const accountMap = getNodeAccountMap(ctx.config.nodeAliases)
        for (const nodeAlias of ctx.config.nodeAliases) {
          const accountId = accountMap.get(nodeAlias)
          subTasks.push({
            title: `Adding stake for node: ${chalk.yellow(nodeAlias)}`,
            task: async () => await this._addStake(ctx.config.namespace, accountId, nodeAlias)
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
    })
  }

  stakeNewNode () {
    return new Task('Stake new node', async (ctx, task) => {
      await this._addStake(ctx.config.namespace, ctx.newNode.accountId, ctx.config.nodeAlias)
    })
  }

  stopNodes () {
    return new Task('Stopping nodes', async (ctx, task) => {
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
    })
  }

  finalize () {
    return new Task('Finalize', async (ctx, task) => {
      // reset flags so that keys are not regenerated later
      this.configManager.setFlag(flags.generateGossipKeys, false)
      this.configManager.setFlag(flags.generateTlsKeys, false)
      this.configManager.persist()
    })
  }

  dumpNetworkNodesSaveState () {
    return new Task('Dump network nodes saved state', async (ctx, task) => {
      const config = /** @type {NodeRefreshConfigClass} **/ ctx.config
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
    })
  }

  getNodeLogsAndConfigs () {
    return new Task('Get node logs and configs', async (ctx, task) => {
      await getNodeLogs(this.k8, ctx.config.namespace)
    })
  }

  checkPVCsEnabled () {
    return new Task('Check that PVCs are enabled', async (ctx, task) => {
      if (!this.configManager.getFlag(flags.persistentVolumeClaims)) {
        throw new SoloError('PVCs are not enabled. Please enable PVCs before adding a node')
      }
    })
  }

  determineNewNodeAccountNumber () {
    return new Task('Determine new node account number', async (ctx, task) => {
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
    })
  }


  generateGossipKeys () {
    return this._generateGossipKeys(true)
  }

  generateGossipKey () {
    return this._generateGossipKeys(false)
  }

  generateGrpcTlsKeys () {
    return this._generateGrpcTlsKeys(true)
  }

  generateGrpcTlsKey () {
    return this._generateGrpcTlsKeys(false)
  }

  loadSigningKeyCertificate () {
    return new Task('Load signing key certificate', async (ctx, task) => {
      const config = ctx.config
      const signingCertFile = Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, config.nodeAlias)
      const signingCertFullPath = path.join(config.keysDir, signingCertFile)
      ctx.signingCertDer = this._loadPermCertificate(signingCertFullPath)
    })
  }

  computeMTLSCertificateHash () {
    return new Task('Compute mTLS certificate hash', async (ctx, task) => {
      const config = ctx.config
      const tlsCertFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias)
      const tlsCertFullPath = path.join(config.keysDir, tlsCertFile)
      const tlsCertDer = this._loadPermCertificate(tlsCertFullPath)
      ctx.tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest()
    })
  }

  prepareGossipEndpoints () {
    return new Task('Prepare gossip endpoints', async (ctx, task) => {
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
        endpoints = splitFlagInput(config.gossipEndpoints)
      }

      ctx.gossipEndpoints = prepareEndpoints(config.endpointType, endpoints, constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT)
    })
  }

  prepareGrpcServiceEndpoints () {
    return new Task('Prepare grpc service endpoints', async (ctx, task) => {
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
        endpoints = splitFlagInput(config.grpcEndpoints)
      }

      ctx.grpcServiceEndpoints = prepareEndpoints(config.endpointType, endpoints, constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT)
    })
  }


  sendNodeUpdateTransaction () {
    return new Task('Send node update transaction', async (ctx, task) => {
      const config = /** @type {NodeUpdateConfigClass} **/ ctx.config

      const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias) - 1
      this.logger.info(`nodeId: ${nodeId}`)
      this.logger.info(`config.newAccountNumber: ${config.newAccountNumber}`)

      try {
        const nodeUpdateTx = await new NodeUpdateTransaction()
            .setNodeId(nodeId)

        if (config.tlsPublicKey && config.tlsPrivateKey) {
          this.logger.info(`config.tlsPublicKey: ${config.tlsPublicKey}`)
          const tlsCertDer = this._loadPermCertificate(config.tlsPublicKey)
          const tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest()
          nodeUpdateTx.setCertificateHash(tlsCertHash)

          const publicKeyFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias)
          const privateKeyFile = Templates.renderTLSPemPrivateKeyFile(config.nodeAlias)
          renameAndCopyFile(config.tlsPublicKey, publicKeyFile, config.keysDir, this.logger)
          renameAndCopyFile(config.tlsPrivateKey, privateKeyFile, config.keysDir, this.logger)
        }

        if (config.gossipPublicKey && config.gossipPrivateKey) {
          this.logger.info(`config.gossipPublicKey: ${config.gossipPublicKey}`)
          const signingCertDer = this._loadPermCertificate(config.gossipPublicKey)
          nodeUpdateTx.setGossipCaCertificate(signingCertDer)

          const publicKeyFile = Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, config.nodeAlias)
          const privateKeyFile = Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, config.nodeAlias)
          renameAndCopyFile(config.gossipPublicKey, publicKeyFile, config.keysDir, this.logger)
          renameAndCopyFile(config.gossipPrivateKey, privateKeyFile, config.keysDir, this.logger)
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
    })
  }

  copyNodeKeysToSecrets () {
    return new Task('Copy node keys to secrets', async (ctx, task) => {
      const subTasks = this.platformInstaller.copyNodeKeys(ctx.config.stagingDir, ctx.config.allNodeAliases)

      // set up the sub-tasks for copying node keys to staging directory
      return task.newListr(subTasks, {
        concurrent: true,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
      })
    })
  }

  /**
   *
   * @param title {string}
   * @param skip {boolean || function}
   * @returns {Task}
   */
  updateChartWithConfigMap (title, skip= false) {
    return new Task(title, async (ctx, task) => {
      // Prepare parameter and update the network node chart
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
    }, skip)
  }

  saveContextData (argv, targetFile, parser) {
    return new Task('Save context data', async (ctx, task) => {
      const outputDir = argv[flags.outputDir.name]
      if (!outputDir) {
        throw new SoloError(`Path to export context data not specified. Please set a value for --${flags.outputDir.name}`)
      }

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }
      const exportedCtx = parser(ctx)
      fs.writeFileSync(path.join(outputDir, targetFile), JSON.stringify(exportedCtx))
    })
  }

  loadContextData (argv, targetFile, parser) {
    return new Task('Load context data', async (ctx, task) => {
      const inputDir = argv[flags.inputDir.name]
      if (!inputDir) {
        throw new SoloError(`Path to context data not specified. Please set a value for --${flags.inputDir.name}`)
      }
      const ctxData = JSON.parse(fs.readFileSync(path.join(inputDir, targetFile)))
      parser(ctx, ctxData)
    })
  }

  killNodes () {
    return new Task('Kill nodes', async (ctx, task) => {
      const config = ctx.config
      for (const /** @type {NetworkNodeServices} **/ service of config.serviceMap.values()) {
        await this.k8.kubeClient.deleteNamespacedPod(service.nodePodName, config.namespace, undefined, undefined, 1)
      }
    })
  }

  killNodesAndUpdateConfigMap () {
    return new Task('Kill nodes to pick up updated configMaps', async (ctx, task) => {
      const config = ctx.config
      // the updated node will have a new pod ID if its account ID changed which is a label
      config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace)
      for (const /** @type {NetworkNodeServices} **/ service of config.serviceMap.values()) {
        await this.k8.kubeClient.deleteNamespacedPod(service.nodePodName, config.namespace, undefined, undefined, 1)
      }
      this.logger.info('sleep for 15 seconds to give time for pods to finish terminating')
      await sleep(15000)

      // again, the pod names will change after the pods are killed
      config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace)
      config.podNames = {}
      for (const service of config.serviceMap.values()) {
        config.podNames[service.nodeAlias] = service.nodePodName
      }
    })
  }


  checkNodePodsAreRunning () {
    return new Task('Check node pods are running', async (ctx, task) => {
      const config = /** @type {NodeUpdateConfigClass} **/ ctx.config
      const subTasks = []
      for (const nodeAlias of config.allNodeAliases) {
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
    })
  }


  sleep (title, milliseconds) {
    return new Task(title, async (ctx, task) => {
      await sleep(milliseconds)
    })
  }

  downloadLastState () {
    return new Task('Download last state from an existing node', async (ctx, task) => {
      const config = ctx.config
      const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeAliases[0])
      const upgradeDirectory = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/0/123`
      // zip the contents of the newest folder on node1 within /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/
      const zipFileName = await this.k8.execContainer(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `cd ${upgradeDirectory} && mapfile -t states < <(ls -1t .) && jar cf "\${states[0]}.zip" -C "\${states[0]}" . && echo -n \${states[0]}.zip`])
      await this.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${upgradeDirectory}/${zipFileName}`, config.stagingDir)
      config.lastStateZipPath = path.join(config.stagingDir, zipFileName)
    })
  }

  uploadStateToNewNode () {
    return new Task('Upload last saved state to new network node', async (ctx, task) => {
      const config = ctx.config
      const newNodeFullyQualifiedPodName = Templates.renderNetworkPodName(config.nodeAlias)
      const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias)
      const savedStateDir = (config.lastStateZipPath.match(/\/(\d+)\.zip$/))[1]
      const savedStatePath = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/${nodeId}/123/${savedStateDir}`
      await this.k8.execContainer(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `mkdir -p ${savedStatePath}`])
      await this.k8.copyTo(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, config.lastStateZipPath, savedStatePath)
      await this.platformInstaller.setPathPermission(newNodeFullyQualifiedPodName, constants.HEDERA_HAPI_PATH)
      await this.k8.execContainer(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `cd ${savedStatePath} && jar xf ${path.basename(config.lastStateZipPath)} && rm -f ${path.basename(config.lastStateZipPath)}`])
    })
  }

  sendNodeDeleteTransaction () {
    return new Task('Send node delete transaction', async (ctx, task) => {
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
    })
  }

  sendNodeCreateTransaction () {
    return new Task('Send node create transaction', async (ctx, task) => {
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
    })
  }

  templateTask () {
    return new Task('TEMPLATE', async (ctx, task) => {

    })
  }


  /**
   * @param {Object} argv
   * @param {Function} configInit
   * @returns {Task}
   */
  initialize (argv, configInit) {
    const { requiredFlags, requiredFlagsWithDisabledPrompt, optionalFlags } = argv
    const allRequiredFlags = [
      ...requiredFlags,
      ...requiredFlagsWithDisabledPrompt
    ]

    argv.flags = [
      ...requiredFlags,
      ...requiredFlagsWithDisabledPrompt,
      ...optionalFlags
    ]

    return new Task('Initialize', async (ctx, task) => {
      if (argv[flags.devMode.name]) {
        this.logger.setDevMode(true)
      }

      this.configManager.update(argv)

      // disable the prompts that we don't want to prompt the user for
      prompts.disablePrompts([...requiredFlagsWithDisabledPrompt, ...optionalFlags])
      await prompts.execute(task, this.configManager, requiredFlags)

      const config = await configInit(argv, ctx, task)
      ctx.config = config

      for (const flag of allRequiredFlags) {
        if (typeof config[flag.constName] === 'undefined') {
          throw new MissingArgumentError(`No value set for required flag: ${flag.name}`, flag.name)
        }
      }

      this.logger.debug('Initialized config', { config })
    })
  }
}
