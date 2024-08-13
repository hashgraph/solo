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
import { readFile, writeFile } from 'fs/promises'
import { Listr } from 'listr2'
import path from 'path'
import { FullstackTestingError, IllegalArgumentError } from '../core/errors.mjs'
import * as helpers from '../core/helpers.mjs'
import { getNodeAccountMap, getNodeLogs, getTmpDir, sleep, validatePath } from '../core/helpers.mjs'
import { constants, Templates, Zippy } from '../core/index.mjs'
import { BaseCommand } from './base.mjs'
import * as flags from './flags.mjs'
import * as prompts from './prompts.mjs'

import {
  AccountBalanceQuery,
  AccountUpdateTransaction,
  FileUpdateTransaction,
  FileAppendTransaction,
  FreezeTransaction,
  FreezeType,
  ServiceEndpoint,
  Timestamp,
  PrivateKey,
  AccountId,
  NodeCreateTransaction
} from '@hashgraph/sdk'
import * as crypto from 'crypto'
import {
  FREEZE_ADMIN_ACCOUNT,
  HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
  TREASURY_ACCOUNT_ID
} from '../core/constants.mjs'

/**
 * Defines the core functionalities of 'node' command
 */
export class NodeCommand extends BaseCommand {
  constructor (opts) {
    super(opts)

    if (!opts || !opts.downloader) throw new IllegalArgumentError('An instance of core/PackageDownloader is required', opts.downloader)
    if (!opts || !opts.platformInstaller) throw new IllegalArgumentError('An instance of core/PlatformInstaller is required', opts.platformInstaller)
    if (!opts || !opts.keyManager) throw new IllegalArgumentError('An instance of core/KeyManager is required', opts.keyManager)
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.keytoolDepManager) throw new IllegalArgumentError('An instance of KeytoolDependencyManager is required', opts.keytoolDepManager)

    this.downloader = opts.downloader
    this.platformInstaller = opts.platformInstaller
    this.keyManager = opts.keyManager
    this.accountManager = opts.accountManager
    this.keytoolDepManager = opts.keytoolDepManager
    this._portForwards = []
  }

  static get SETUP_CONFIGS_NAME () {
    return 'setupConfigs'
  }

  static get SETUP_FLAGS_LIST () {
    return [
      flags.apiPermissionProperties,
      flags.app,
      flags.appConfig,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.cacheDir,
      flags.chainId,
      flags.devMode,
      flags.force,
      flags.generateGossipKeys,
      flags.generateTlsKeys,
      flags.keyFormat,
      flags.localBuildPath,
      flags.log4j2Xml,
      flags.namespace,
      flags.nodeIDs,
      flags.releaseTag,
      flags.settingTxt
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
      flags.keyFormat,
      flags.nodeIDs
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
      flags.force,
      flags.keyFormat,
      flags.namespace,
      flags.nodeIDs,
      flags.releaseTag
    ]
  }

  static get ADD_CONFIGS_NAME () {
    return 'addConfigs'
  }

  static get ADD_FLAGS_LIST () {
    return [
      flags.apiPermissionProperties,
      flags.applicationProperties,
      flags.bootstrapProperties,
      flags.cacheDir,
      flags.chainId,
      flags.chartDirectory,
      flags.devMode,
      flags.endpointType,
      flags.force,
      flags.fstChartVersion,
      flags.generateGossipKeys,
      flags.generateTlsKeys,
      flags.gossipEndpoints,
      flags.grpcEndpoints,
      flags.keyFormat,
      flags.log4j2Xml,
      flags.namespace,
      flags.nodeID,
      flags.releaseTag,
      flags.settingTxt
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

  async addStake (namespace, accountId, nodeId) {
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
        .setStakedNodeId(Templates.nodeNumberFromNodeId(nodeId) - 1)
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
      throw new FullstackTestingError(`Error in adding stake: ${e.message}`, e)
    }
  }

  async checkNetworkNodePod (namespace, nodeId, maxAttempts = 60, delay = 2000) {
    nodeId = nodeId.trim()
    const podName = Templates.renderNetworkPodName(nodeId)

    try {
      await this.k8.waitForPods([constants.POD_PHASE_RUNNING], [
        'fullstack.hedera.com/type=network-node',
        `fullstack.hedera.com/node-name=${nodeId}`
      ], 1, maxAttempts, delay)

      return podName
    } catch (e) {
      throw new FullstackTestingError(`no pod found for nodeId: ${nodeId}`, e)
    }
  }

  async checkNetworkNodeState (nodeId, maxAttempt = 100, status = 'ACTIVE', logfile = 'output/hgcaa.log') {
    nodeId = nodeId.trim()
    const podName = Templates.renderNetworkPodName(nodeId)
    const logfilePath = `${constants.HEDERA_HAPI_PATH}/${logfile}`
    let attempt = 0
    let isActive = false

    this.logger.debug(`Checking if node ${nodeId} is ${status}...`)
    // check log file is accessible
    let logFileAccessible = false
    while (attempt++ < maxAttempt) {
      try {
        if (await this.k8.hasFile(podName, constants.ROOT_CONTAINER, logfilePath)) {
          logFileAccessible = true
          break
        }
      } catch (e) {
      } // ignore errors

      await sleep(1000)
    }

    if (!logFileAccessible) {
      throw new FullstackTestingError(`Logs are not accessible: ${logfilePath}`)
    }

    attempt = 0
    while (attempt < maxAttempt) {
      try {
        const output = await this.k8.execContainer(podName, constants.ROOT_CONTAINER, ['tail', '-100', logfilePath])
        if (output && output.indexOf('Terminating Netty') < 0 && // make sure we are not at the beginning of a restart
          (output.indexOf(`Now current platform status = ${status}`) > 0 ||
            output.indexOf(`Platform Status Change ${status}`) > 0 ||
            output.indexOf(`is ${status}`) > 0)) { // 'is ACTIVE' is for newer versions, first seen in v0.49.0
          this.logger.debug(`Node ${nodeId} is ${status} [ attempt: ${attempt}/${maxAttempt}]`)
          isActive = true
          break
        }
        this.logger.debug(`Node ${nodeId} is not ${status} yet. Trying again... [ attempt: ${attempt}/${maxAttempt} ]`)
      } catch (e) {
        this.logger.warn(`error in checking if node ${nodeId} is ${status}: ${e.message}. Trying again... [ attempt: ${attempt}/${maxAttempt} ]`)

        // ls the HAPI path for debugging
        await this.k8.execContainer(podName, constants.ROOT_CONTAINER, `ls -la ${constants.HEDERA_HAPI_PATH}`)

        // ls the output directory for debugging
        await this.k8.execContainer(podName, constants.ROOT_CONTAINER, `ls -la ${constants.HEDERA_HAPI_PATH}/output`)
      }
      attempt += 1
      await sleep(1000)
    }

    this.logger.info(`!> -- Node ${nodeId} is ${status} -- <!`)

    if (!isActive) {
      throw new FullstackTestingError(`node '${nodeId}' is not ${status} [ attempt = ${attempt}/${maxAttempt} ]`)
    }

    return true
  }

  /**
   * Return task for checking for all network node pods
   */
  taskCheckNetworkNodePods (ctx, task, nodeIds) {
    if (!ctx.config) {
      ctx.config = {}
    }

    ctx.config.podNames = {}

    const subTasks = []
    for (const nodeId of nodeIds) {
      subTasks.push({
        title: `Check network pod: ${chalk.yellow(nodeId)}`,
        task: async (ctx) => {
          ctx.config.podNames[nodeId] = await this.checkNetworkNodePod(ctx.config.namespace, nodeId)
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
   * Return a list of subtasks to generate gossip keys
   *
   * WARNING: These tasks MUST run in sequence.
   *
   * @param keyFormat key format (pem | pfx)
   * @param nodeIds node ids
   * @param keysDir keys directory
   * @param curDate current date
   * @param allNodeIds includes the nodeIds to get new keys as well as existing nodeIds that will be included in the public.pfx file
   * @return a list of subtasks
   * @private
   */
  _nodeGossipKeysTaskList (keyFormat, nodeIds, keysDir, curDate = new Date(), allNodeIds = null) {
    allNodeIds = allNodeIds || nodeIds
    if (!Array.isArray(nodeIds) || !nodeIds.every((nodeId) => typeof nodeId === 'string')) {
      throw new IllegalArgumentError('nodeIds must be an array of strings')
    }
    const self = this
    const subTasks = []

    switch (keyFormat) {
      case constants.KEY_FORMAT_PFX: {
        const tmpDir = getTmpDir()
        const keytool = self.keytoolDepManager.getKeytool()

        subTasks.push({
          title: `Check keytool exists (Version: ${self.keytoolDepManager.getKeytoolVersion()})`,
          task: async () => self.keytoolDepManager.checkVersion(true)

        })

        subTasks.push({
          title: 'Backup old files',
          task: () => helpers.backupOldPfxKeys(nodeIds, keysDir, curDate)
        })

        for (const nodeId of nodeIds) {
          subTasks.push({
            title: `Generate ${Templates.renderGossipPfxPrivateKeyFile(nodeId)} for node: ${chalk.yellow(nodeId)}`,
            task: async () => {
              const privatePfxFile = await self.keyManager.generatePrivatePfxKeys(keytool, nodeId, keysDir, tmpDir)
              const output = await keytool.list(`-storetype pkcs12 -storepass password -keystore ${privatePfxFile}`)
              if (!output.includes('Your keystore contains 3 entries')) {
                throw new FullstackTestingError(`malformed private pfx file: ${privatePfxFile}`)
              }
            }
          })
        }

        subTasks.push({
          title: `Generate ${constants.PUBLIC_PFX} file`,
          task: async () => {
            const publicPfxFile = await self.keyManager.updatePublicPfxKey(self.keytoolDepManager.getKeytool(), allNodeIds, keysDir, tmpDir)
            const output = await keytool.list(`-storetype pkcs12 -storepass password -keystore ${publicPfxFile}`)
            if (!output.includes(`Your keystore contains ${allNodeIds.length * 3} entries`)) {
              throw new FullstackTestingError(`malformed public.pfx file: ${publicPfxFile}`)
            }
          }
        })

        subTasks.push({
          title: 'Clean up temp files',
          task: async () => {
            if (fs.existsSync(tmpDir)) {
              fs.rmSync(tmpDir, { recursive: true })
            }
          }
        })
        break
      }

      case constants.KEY_FORMAT_PEM: {
        subTasks.push({
          title: 'Backup old files',
          task: () => helpers.backupOldPemKeys(nodeIds, keysDir, curDate)
        }
        )

        for (const nodeId of nodeIds) {
          subTasks.push({
            title: `Gossip ${keyFormat} key for node: ${chalk.yellow(nodeId)}`,
            task: async () => {
              const signingKey = await this.keyManager.generateSigningKey(nodeId)
              const signingKeyFiles = await this.keyManager.storeSigningKey(nodeId, signingKey, keysDir)
              this.logger.debug(`generated Gossip signing keys for node ${nodeId}`, { keyFiles: signingKeyFiles })

              const agreementKey = await this.keyManager.generateAgreementKey(nodeId, signingKey)
              const agreementKeyFiles = await this.keyManager.storeAgreementKey(nodeId, agreementKey, keysDir)
              this.logger.debug(`generated Gossip agreement keys for node ${nodeId}`, { keyFiles: agreementKeyFiles })
            }
          })
        }

        break
      }

      default:
        throw new FullstackTestingError(`unsupported key-format: ${keyFormat}`)
    }

    return subTasks
  }

  /**
   * Return a list of subtasks to generate gRPC TLS keys
   *
   * WARNING: These tasks should run in sequence
   *
   * @param nodeIds node ids
   * @param keysDir keys directory
   * @param curDate current date
   * @return return a list of subtasks
   * @private
   */
  _nodeTlsKeyTaskList (nodeIds, keysDir, curDate = new Date()) {
    // check if nodeIds is an array of strings
    if (!Array.isArray(nodeIds) || !nodeIds.every((nodeId) => typeof nodeId === 'string')) {
      throw new FullstackTestingError('nodeIds must be an array of strings')
    }
    const self = this
    const nodeKeyFiles = new Map()
    const subTasks = []

    subTasks.push({
      title: 'Backup old files',
      task: () => helpers.backupOldTlsKeys(nodeIds, keysDir, curDate)
    }
    )

    for (const nodeId of nodeIds) {
      subTasks.push({
        title: `TLS key for node: ${chalk.yellow(nodeId)}`,
        task: async () => {
          const tlsKey = await self.keyManager.generateGrpcTLSKey(nodeId)
          const tlsKeyFiles = await self.keyManager.storeTLSKey(nodeId, tlsKey, keysDir)
          nodeKeyFiles.set(nodeId, {
            tlsKeyFiles
          })
        }
      })
    }

    return subTasks
  }

  async _copyNodeKeys (nodeKey, destDir) {
    for (const keyFile of [nodeKey.privateKeyFile, nodeKey.certificateFile]) {
      if (!fs.existsSync(keyFile)) {
        throw new FullstackTestingError(`file (${keyFile}) is missing`)
      }

      const fileName = path.basename(keyFile)
      fs.cpSync(keyFile, `${destDir}/${fileName}`)
    }
  }

  async initializeSetup (config, configManager, k8) {
    // compute other config parameters
    config.releasePrefix = Templates.prepareReleasePrefix(config.releaseTag)
    config.buildZipFile = `${config.cacheDir}/${config.releasePrefix}/build-${config.releaseTag}.zip`
    config.keysDir = path.join(validatePath(config.cacheDir), 'keys')
    config.stagingDir = Templates.renderStagingDir(configManager, flags)
    config.stagingKeysDir = path.join(validatePath(config.stagingDir), 'keys')

    if (!await k8.hasNamespace(config.namespace)) {
      throw new FullstackTestingError(`namespace ${config.namespace} does not exist`)
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

  uploadPlatformSoftware (nodeIds, podNames, task, localBuildPath) {
    const self = this
    const subTasks = []

    self.logger.debug('no need to fetch, use local build jar files')

    const buildPathMap = new Map()
    let defaultDataLibBuildPath
    const parameterPairs = localBuildPath.split(',')
    for (const parameterPair of parameterPairs) {
      if (parameterPair.includes('=')) {
        const [nodeId, localDataLibBuildPath] = parameterPair.split('=')
        buildPathMap.set(nodeId, localDataLibBuildPath)
      } else {
        defaultDataLibBuildPath = parameterPair
      }
    }

    let localDataLibBuildPath
    for (const nodeId of nodeIds) {
      const podName = podNames[nodeId]
      if (buildPathMap.has(nodeId)) {
        localDataLibBuildPath = buildPathMap.get(nodeId)
      } else {
        localDataLibBuildPath = defaultDataLibBuildPath
      }

      if (!fs.existsSync(localDataLibBuildPath)) {
        throw new FullstackTestingError(`local build path does not exist: ${localDataLibBuildPath}`)
      }

      subTasks.push({
        title: `Copy local build to Node: ${chalk.yellow(nodeId)} from ${localDataLibBuildPath}`,
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

  fetchLocalOrReleasedPlatformSoftware (nodeIds, podNames, releaseTag, task) {
    const self = this
    const localBuildPath = self.configManager.getFlag(flags.localBuildPath)
    if (localBuildPath !== '') {
      return self.uploadPlatformSoftware(nodeIds, podNames, task, localBuildPath)
    } else {
      return self.fetchPlatformSoftware(nodeIds, podNames, releaseTag, task, self.platformInstaller)
    }
  }

  fetchPlatformSoftware (nodeIds, podNames, releaseTag, task, platformInstaller) {
    const subTasks = []
    for (const nodeId of nodeIds) {
      const podName = podNames[nodeId]
      subTasks.push({
        title: `Update node: ${chalk.yellow(nodeId)} [ platformVersion = ${releaseTag} ]`,
        task: () =>
          platformInstaller.fetchPlatform(podName, releaseTag)
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

  async prepareUpgradeZip (stagingDir) {
    // we build a mock upgrade.zip file as we really don't need to upgrade the network
    // also the platform zip file is ~80Mb in size requiring a lot of transactions since the max
    // transaction size is 6Kb and in practice we need to send the file as 4Kb chunks.
    // Note however that in DAB phase-2, we won't need to trigger this fake upgrade process
    const zipper = new Zippy(this.logger)
    const upgradeConfigDir = `${stagingDir}/mock-upgrade/data/config`
    if (!fs.existsSync(upgradeConfigDir)) {
      fs.mkdirSync(upgradeConfigDir, { recursive: true })
    }

    // bump field hedera.config.version
    const fileBytes = fs.readFileSync(`${stagingDir}/templates/application.properties`)
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
    fs.writeFileSync(`${upgradeConfigDir}/application.properties`, newLines.join('\n'))

    return await zipper.zip(`${stagingDir}/mock-upgrade`, `${stagingDir}/mock-upgrade.zip`)
  }

  async uploadUpgradeZip (upgradeZipFile, nodeClient) {
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
      throw new FullstackTestingError(`failed to upload build.zip file: ${e.message}`, e)
    }
  }

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
        throw new FullstackTestingError(`incorrect endpoint format. expected url:port, found ${endpoint}`)
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

  async setup (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.apiPermissionProperties,
            flags.app,
            flags.appConfig,
            flags.applicationProperties,
            flags.bootstrapProperties,
            flags.devMode,
            flags.force,
            flags.localBuildPath,
            flags.log4j2Xml,
            flags.settingTxt
          ])

          await prompts.execute(task, self.configManager, NodeCommand.SETUP_FLAGS_LIST)

          /**
           * @typedef {Object} NodeSetupConfigClass
           * -- flags --
           * @property {string} apiPermissionProperties
           * @property {string} app
           * @property {string} appConfig
           * @property {string} applicationProperties
           * @property {string} bootstrapProperties
           * @property {string} cacheDir
           * @property {string} chainId
           * @property {boolean} devMode
           * @property {boolean} force
           * @property {boolean} generateGossipKeys
           * @property {boolean} generateTlsKeys
           * @property {string} keyFormat
           * @property {string} localBuildPath
           * @property {string} log4j2Xml
           * @property {string} namespace
           * @property {string} nodeIDs
           * @property {string} releaseTag
           * @property {string} settingTxt
           * -- extra args --
           * @property {string} buildZipFile
           * @property {Date} curDate
           * @property {string} keysDir
           * @property {string[]} nodeIds
           * @property {Object} podNames
           * @property {string} releasePrefix
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
          const config = /** @type {NodeSetupConfigClass} **/ this.getConfig(NodeCommand.SETUP_CONFIGS_NAME, NodeCommand.SETUP_FLAGS_LIST,
            [
              'buildZipFile',
              'curDate',
              'keysDir',
              'nodeIds',
              'podNames',
              'releasePrefix',
              'stagingDir',
              'stagingKeysDir'
            ])

          config.nodeIds = helpers.parseNodeIds(config.nodeIDs)
          config.curDate = new Date()

          await self.initializeSetup(config, self.configManager, self.k8)

          // set config in the context for later tasks to use
          ctx.config = config

          self.logger.debug('Initialized config', { config })
        }
      },
      {
        title: 'Identify network pods',
        task: (ctx, task) => self.taskCheckNetworkNodePods(ctx, task, ctx.config.nodeIds)
      },
      {
        title: 'Generate Gossip keys',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeGossipKeysTaskList(config.keyFormat, config.nodeIds, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS keys',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeTlsKeyTaskList(config.nodeIds, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateTlsKeys
      },
      {
        title: 'Prepare staging directory',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = [
            {
              title: 'Copy configuration files',
              task: () => {
                for (const flag of flags.nodeConfigFileFlags.values()) {
                  const filePath = self.configManager.getFlag(flag)
                  if (!filePath) {
                    throw new FullstackTestingError(`Configuration file path is missing for: ${flag.name}`)
                  }

                  const fileName = path.basename(filePath)
                  const destPath = `${config.stagingDir}/templates/${fileName}`
                  self.logger.debug(`Copying configuration file to staging: ${filePath} -> ${destPath}`)

                  fs.cpSync(filePath, destPath, { force: true })
                }
              }
            },
            {
              title: 'Copy Gossip keys to staging',
              task: async (ctx, _) => {
                await this.copyGossipKeysToStaging(ctx.config.keyFormat, ctx.config.keysDir, ctx.config.stagingKeysDir, ctx.config.nodeIds)
              }
            },
            {
              title: 'Copy gRPC TLS keys to staging',
              task: async (ctx, _) => {
                for (const nodeId of ctx.config.nodeIds) {
                  const tlsKeyFiles = self.keyManager.prepareTLSKeyFilePaths(nodeId, config.keysDir)
                  await self._copyNodeKeys(tlsKeyFiles, config.stagingKeysDir)
                }
              }
            },
            {
              title: 'Prepare config.txt for the network',
              task: async (ctx, _) => {
                const configTxtPath = `${ctx.config.stagingDir}/config.txt`
                const template = `${constants.RESOURCES_DIR}/templates/config.template`
                await self.platformInstaller.prepareConfigTxt(
                  ctx.config.nodeIds,
                  configTxtPath,
                  ctx.config.releaseTag,
                  ctx.config.chainId,
                  template,
                  ctx.config.app || undefined)
              }
            }
          ]

          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Fetch platform software into network nodes',
        task:
          async (ctx, task) => {
            const config = /** @type {NodeSetupConfigClass} **/ ctx.config
            return self.fetchLocalOrReleasedPlatformSoftware(config.nodeIds, config.podNames, config.releaseTag, task)
          }
      },
      {
        title: 'Setup network nodes',
        task: async (ctx, parentTask) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            const podName = ctx.config.podNames[nodeId]
            subTasks.push({
              title: `Node: ${chalk.yellow(nodeId)}`,
              task: () =>
                self.platformInstaller.taskInstall(
                  podName,
                  ctx.config.buildZipFile,
                  ctx.config.stagingDir,
                  ctx.config.nodeIds,
                  ctx.config.keyFormat,
                  ctx.config.force)
            })
          }

          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Finalize',
        task: (ctx, _) => {
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
      throw new FullstackTestingError(`Error in setting up nodes: ${e.message}`, e)
    }

    return true
  }

  async start (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace,
            flags.nodeIDs
          ])

          ctx.config = {
            app: self.configManager.getFlag(flags.app),
            cacheDir: self.configManager.getFlag(flags.cacheDir),
            namespace: self.configManager.getFlag(flags.namespace),
            nodeIds: helpers.parseNodeIds(self.configManager.getFlag(flags.nodeIDs))
          }

          ctx.config.stagingDir = Templates.renderStagingDir(self.configManager, flags)

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new FullstackTestingError(`namespace ${ctx.config.namespace} does not exist`)
          }
        }
      },
      {
        title: 'Identify network pods',
        task: (ctx, task) => self.taskCheckNetworkNodePods(ctx, task, ctx.config.nodeIds)
      },
      {
        title: 'Starting nodes',
        task: (ctx, task) => {
          const subTasks = []
          self.startNodes(ctx.config.podNames, ctx.config.nodeIds, subTasks)

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        }
      },
      {
        title: 'Check nodes are ACTIVE',
        task: (ctx, task) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            if (self.configManager.getFlag(flags.app) !== '') {
              subTasks.push({
                title: `Check node: ${chalk.yellow(nodeId)}`,
                task: () => self.checkNetworkNodeState(nodeId, 100, 'ACTIVE', 'output/swirlds.log')
              })
            } else {
              subTasks.push({
                title: `Check node: ${chalk.yellow(nodeId)}`,
                task: () => self.checkNetworkNodeState(nodeId)
              })
            }
          }

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false
            }
          })
        }
      },
      {
        title: 'Check node proxies are ACTIVE',
        task: async (ctx, parentTask) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            subTasks.push({
              title: `Check proxy for node: ${chalk.yellow(nodeId)}`,
              task: async () => await self.k8.waitForPodReady(
                [`app=haproxy-${nodeId}`, 'fullstack.hedera.com/type=haproxy'],
                1, 300, 2000)
            })
          }

          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false
            }
          })
        },
        skip: (ctx, _) => self.configManager.getFlag(flags.app) !== ''
      },
      {
        title: 'Add node stakes',
        task: (ctx, task) => {
          if (ctx.config.app === '' || ctx.config.app === constants.HEDERA_APP_NAME) {
            const subTasks = []
            const accountMap = getNodeAccountMap(ctx.config.nodeIds)
            for (const nodeId of ctx.config.nodeIds) {
              const accountId = accountMap.get(nodeId)
              subTasks.push({
                title: `Adding stake for node: ${chalk.yellow(nodeId)}`,
                task: () => self.addStake(ctx.config.namespace, accountId, nodeId)
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
      throw new FullstackTestingError(`Error starting node: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  async stop (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)
          await prompts.execute(task, self.configManager, [
            flags.namespace,
            flags.nodeIDs
          ])

          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            nodeIds: helpers.parseNodeIds(self.configManager.getFlag(flags.nodeIDs))
          }

          if (!await self.k8.hasNamespace(ctx.config.namespace)) {
            throw new FullstackTestingError(`namespace ${ctx.config.namespace} does not exist`)
          }
        }
      },
      {
        title: 'Identify network pods',
        task: (ctx, task) => self.taskCheckNetworkNodePods(ctx, task, ctx.config.nodeIds)
      },
      {
        title: 'Stopping nodes',
        task: (ctx, task) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            const podName = ctx.config.podNames[nodeId]
            subTasks.push({
              title: `Stop node: ${chalk.yellow(nodeId)}`,
              task: () => self.k8.execContainer(podName, constants.ROOT_CONTAINER, 'systemctl stop network-node')
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
      throw new FullstackTestingError('Error stopping node', e)
    }

    return true
  }

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
           * @property {string} keyFormat
           * @property {string} nodeIDs
           * -- extra args --
           * @property {Date} curDate
           * @property {string} keysDir
           * @property {string[]} nodeIds
           * -- methods --
           * @property {getUnusedConfigs} getUnusedConfigs
           */
          /**
           * @callback getUnusedConfigs
           * @returns {string[]}
           */

          // create a config object for subsequent steps
          const config = /** @type {NodeKeysConfigClass} **/ this.getConfig(NodeCommand.SETUP_CONFIGS_NAME, NodeCommand.SETUP_FLAGS_LIST,
            [
              'curDate',
              'keysDir',
              'nodeIds'
            ])

          config.curDate = new Date()
          config.nodeIds = helpers.parseNodeIds(config.nodeIDs)
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
          const subTasks = self._nodeGossipKeysTaskList(config.keyFormat, config.nodeIds, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS keys',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeTlsKeyTaskList(config.nodeIds, config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateTlsKeys
      },
      {
        title: 'Finalize',
        task: (ctx, _) => {
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
      throw new FullstackTestingError(`Error generating keys: ${e.message}`, e)
    }

    return true
  }

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
            flags.force
          ])

          await prompts.execute(task, self.configManager, NodeCommand.REFRESH_FLAGS_LIST)

          /**
           * @typedef {Object} NodeRefreshConfigClass
           * -- flags --
           * @property {string} app
           * @property {string} cacheDir
           * @property {boolean} devMode
           * @property {boolean} force
           * @property {string} keyFormat
           * @property {string} namespace
           * @property {string} nodeIDs
           * @property {string} releaseTag
           * -- extra args --
           * @property {string} buildZipFile
           * @property {string} keysDir
           * @property {string[]} nodeIds
           * @property {Object} podNames
           * @property {string} releasePrefix
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
          ctx.config = /** @type {NodeRefreshConfigClass} **/ this.getConfig(NodeCommand.REFRESH_CONFIGS_NAME, NodeCommand.REFRESH_FLAGS_LIST,
            [
              'buildZipFile',
              'keysDir',
              'nodeIds',
              'podNames',
              'releasePrefix',
              'stagingDir',
              'stagingKeysDir'
            ])

          ctx.config.nodeIds = helpers.parseNodeIds(ctx.config.nodeIDs)

          await self.initializeSetup(ctx.config, self.configManager, self.k8)

          self.logger.debug('Initialized config', ctx.config)
        }
      },
      {
        title: 'Identify network pods',
        task: (ctx, task) => self.taskCheckNetworkNodePods(ctx, task, ctx.config.nodeIds)
      },
      {
        title: 'Dump network nodes saved state',
        task:
          async (ctx, task) => {
            const subTasks = []
            for (const nodeId of ctx.config.nodeIds) {
              const podName = ctx.config.podNames[nodeId]
              subTasks.push({
                title: `Node: ${chalk.yellow(nodeId)}`,
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
            return self.fetchLocalOrReleasedPlatformSoftware(ctx.config.nodeIds, ctx.config.podNames, ctx.config.releaseTag, task)
          }
      },
      {
        title: 'Setup network nodes',
        task: async (ctx, parentTask) => {
          const config = ctx.config

          const subTasks = []
          const nodeList = []
          const networkNodeServicesMap = await self.accountManager.getNodeServiceMap(ctx.config.namespace)
          for (const networkNodeServices of networkNodeServicesMap.values()) {
            nodeList.push(networkNodeServices.nodeName)
          }

          for (const nodeId of config.nodeIds) {
            const podName = config.podNames[nodeId]
            subTasks.push({
              title: `Node: ${chalk.yellow(nodeId)}`,
              task: () =>
                self.platformInstaller.taskInstall(podName, config.buildZipFile,
                  config.stagingDir, nodeList, config.keyFormat, config.force)
            })
          }

          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Finalize',
        task: (ctx, _) => {
          // reset flags so that keys are not regenerated later
          self.configManager.setFlag(flags.generateGossipKeys, false)
          self.configManager.setFlag(flags.generateTlsKeys, false)
          self.configManager.persist()
        }
      },
      {
        title: 'Starting nodes',
        task: (ctx, task) => {
          const subTasks = []
          self.startNodes(ctx.config.podNames, ctx.config.nodeIds, subTasks)

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        }
      },
      {
        title: 'Check nodes are ACTIVE',
        task: (ctx, task) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            if (ctx.config.app !== '') {
              subTasks.push({
                title: `Check node: ${chalk.yellow(nodeId)}`,
                task: () => self.checkNetworkNodeState(nodeId, 100, 'ACTIVE', 'output/swirlds.log')
              })
            } else {
              subTasks.push({
                title: `Check node: ${chalk.yellow(nodeId)}`,
                task: () => self.checkNetworkNodeState(nodeId)
              })
            }
          }

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false
            }
          })
        }
      },
      {
        title: 'Check node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: async (ctx, task) => {
          const subTasks = []
          for (const nodeId of ctx.config.nodeIds) {
            subTasks.push({
              title: `Check proxy for node: ${chalk.yellow(nodeId)}`,
              task: async () => await self.k8.waitForPodReady(
                [`app=haproxy-${nodeId}`, 'fullstack.hedera.com/type=haproxy'],
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
        },
        skip: (ctx, _) => ctx.config.app !== ''
      }], {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
    })

    try {
      await tasks.run()
    } catch (e) {
      throw new FullstackTestingError(`Error in refreshing nodes: ${e.message}`, e)
    }

    return true
  }

  async logs (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          await prompts.execute(task, self.configManager, [
            flags.nodeIDs
          ])

          ctx.config = {
            namespace: self.configManager.getFlag(flags.namespace),
            nodeIds: helpers.parseNodeIds(self.configManager.getFlag(flags.nodeIDs))
          }
          self.logger.debug('Initialized config', { config: ctx.config })
        }
      },
      {
        title: 'Copy logs from all nodes',
        task: (ctx, _) => {
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
      throw new FullstackTestingError(`Error in downloading log from nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  async add (argv) {
    const self = this

    const tasks = new Listr([
      {
        title: 'Initialize',
        task: async (ctx, task) => {
          self.configManager.update(argv)

          // disable the prompts that we don't want to prompt the user for
          prompts.disablePrompts([
            flags.apiPermissionProperties,
            flags.applicationProperties,
            flags.bootstrapProperties,
            flags.chartDirectory,
            flags.devMode,
            flags.endpointType,
            flags.force,
            flags.fstChartVersion,
            flags.gossipEndpoints,
            flags.grpcEndpoints,
            flags.log4j2Xml,
            flags.settingTxt
          ])

          await prompts.execute(task, self.configManager, NodeCommand.ADD_FLAGS_LIST)

          /**
           * @typedef {Object} NodeAddConfigClass
           * -- flags --
           * @property {string} apiPermissionProperties
           * @property {string} applicationProperties
           * @property {string} bootstrapProperties
           * @property {string} cacheDir
           * @property {string} chainId
           * @property {string} chartDirectory
           * @property {boolean} devMode
           * @property {string} endpointType
           * @property {boolean} force
           * @property {string} fstChartVersion
           * @property {boolean} generateGossipKeys
           * @property {boolean} generateTlsKeys
           * @property {string} gossipEndpoints
           * @property {string} grpcEndpoints
           * @property {string} keyFormat
           * @property {string} log4j2Xml
           * @property {string} namespace
           * @property {string} nodeId
           * @property {string} releaseTag
           * @property {string} settingTxt
           * -- extra args --
           * @property {PrivateKey} adminKey
           * @property {string[]} allNodeIds
           * @property {string} buildZipFile
           * @property {string} chartPath
           * @property {Date} curDate
           * @property {string[]} existingNodeIds
           * @property {string} freezeAdminPrivateKey
           * @property {string} keysDir
           * @property {string} lastStateZipPath
           * @property {Object} nodeClient
           * @property {string[]} nodeIds
           * @property {Object} podNames
           * @property {string} releasePrefix
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
              'adminKey',
              'allNodeIds',
              'buildZipFile',
              'chartPath',
              'curDate',
              'existingNodeIds',
              'freezeAdminPrivateKey',
              'keysDir',
              'lastStateZipPath',
              'nodeClient',
              'nodeIds',
              'podNames',
              'releasePrefix',
              'serviceMap',
              'stagingDir',
              'stagingKeysDir',
              'treasuryKey'
            ])

          config.curDate = new Date()
          config.existingNodeIds = []
          config.nodeIds = [config.nodeId]

          if (config.keyFormat !== constants.KEY_FORMAT_PEM) {
            throw new FullstackTestingError('key type cannot be PFX')
          }

          await self.initializeSetup(config, self.configManager, self.k8)

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
      {
        title: 'Identify existing network nodes',
        task: async (ctx, task) => {
          ctx.config.serviceMap = await self.accountManager.getNodeServiceMap(
            ctx.config.namespace)
          for (/** @type {NetworkNodeServices} **/ const networkNodeServices of ctx.config.serviceMap.values()) {
            ctx.config.existingNodeIds.push(networkNodeServices.nodeName)
          }

          return self.taskCheckNetworkNodePods(ctx, task, ctx.config.existingNodeIds)
        }
      },
      {
        title: 'Determine new node account number',
        task: (ctx, task) => {
          const values = { hedera: { nodes: [] } }
          let maxNum = 0

          for (/** @type {NetworkNodeServices} **/ const networkNodeServices of ctx.config.serviceMap.values()) {
            values.hedera.nodes.push({
              accountId: networkNodeServices.accountId,
              name: networkNodeServices.nodeName
            })
            maxNum = maxNum > AccountId.fromString(networkNodeServices.accountId).num
              ? maxNum
              : AccountId.fromString(networkNodeServices.accountId).num
          }

          ctx.maxNum = maxNum
          ctx.newNode = {
            accountId: `${constants.HEDERA_NODE_ACCOUNT_ID_START.realm}.${constants.HEDERA_NODE_ACCOUNT_ID_START.shard}.${++maxNum}`,
            name: ctx.config.nodeId
          }
        }
      },
      {
        title: 'Generate Gossip key',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeGossipKeysTaskList(config.keyFormat, [config.nodeId], config.keysDir, config.curDate, config.allNodeIds)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateGossipKeys
      },
      {
        title: 'Generate gRPC TLS key',
        task: async (ctx, parentTask) => {
          const config = ctx.config
          const subTasks = self._nodeTlsKeyTaskList([config.nodeId], config.keysDir, config.curDate)
          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        },
        skip: (ctx, _) => !ctx.config.generateTlsKeys
      },
      {
        title: 'Load signing key certificate',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const signingCertFile = Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, config.nodeId)
          const signingCertFullPath = `${config.keysDir}/${signingCertFile}`
          const signingCertPem = fs.readFileSync(signingCertFullPath).toString()
          const decodedDers = x509.PemConverter.decode(signingCertPem)
          if (!decodedDers || decodedDers.length === 0) {
            throw new FullstackTestingError('unable to decode public key: ' + signingCertFile)
          }
          ctx.signingCertDer = new Uint8Array(decodedDers[0])
        }
      },
      {
        title: 'Compute mTLS certificate hash',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const tlsCertFile = Templates.renderTLSPemPublicKeyFile(config.nodeId)
          const tlsCertFullPath = `${config.keysDir}/${tlsCertFile}`
          const tlsCertPem = fs.readFileSync(tlsCertFullPath).toString()
          const tlsCertDers = x509.PemConverter.decode(tlsCertPem)
          if (!tlsCertDers || tlsCertDers.length === 0) {
            throw new FullstackTestingError('unable to decode tls cert: ' + tlsCertFullPath)
          }
          const tlsCertDer = new Uint8Array(tlsCertDers[0])
          ctx.tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest()
        }
      },
      {
        title: 'Prepare gossip endpoints',
        task: (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          let endpoints = []
          if (!config.gossipEndpoints) {
            if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
              throw new FullstackTestingError(`--gossip-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`)
            }

            endpoints = [
              `${Templates.renderFullyQualifiedNetworkPodName(config.namespace, config.nodeId)}:${constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT}`,
              `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeId)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`
            ]
          } else {
            endpoints = helpers.splitFlagInput(config.gossipEndpoints)
          }

          ctx.gossipEndpoints = this.prepareEndpoints(config.endpointType, endpoints, constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT)
        }
      },
      {
        title: 'Prepare grpc service endpoints',
        task: (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          let endpoints = []

          if (!config.grpcEndpoints) {
            if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
              throw new FullstackTestingError(`--grpc-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`)
            }

            endpoints = [
              `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeId)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`
            ]
          } else {
            endpoints = helpers.splitFlagInput(config.grpcEndpoints)
          }

          ctx.grpcServiceEndpoints = this.prepareEndpoints(config.endpointType, endpoints, constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT)
        }
      },
      {
        title: 'Load node admin key',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY)
        }
      },
      {
        title: 'Prepare upgrade zip file for node upgrade process',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          ctx.upgradeZipFile = await this.prepareUpgradeZip(config.stagingDir)
          ctx.upgradeZipHash = await this.uploadUpgradeZip(ctx.upgradeZipFile, config.nodeClient)
        }
      },
      {
        title: 'Check existing nodes staked amount',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          await sleep(60000)
          const accountMap = getNodeAccountMap(config.existingNodeIds)
          for (const nodeId of config.existingNodeIds) {
            const accountId = accountMap.get(nodeId)
            await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, 1)
          }
        }
      },
      {
        title: 'Send node create transaction',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config

          try {
            const nodeCreateTx = await new NodeCreateTransaction()
              .setAccountId(ctx.newNode.accountId)
              .setGossipEndpoints(ctx.gossipEndpoints)
              .setServiceEndpoints(ctx.grpcServiceEndpoints)
              .setGossipCaCertificate(ctx.signingCertDer)
              .setCertificateHash(ctx.tlsCertHash)
              .setAdminKey(config.adminKey.publicKey)
              .freezeWith(config.nodeClient)
            const signedTx = await nodeCreateTx.sign(config.adminKey)
            const txResp = await signedTx.execute(config.nodeClient)
            const nodeCreateReceipt = await txResp.getReceipt(config.nodeClient)
            this.logger.debug(`NodeCreateReceipt: ${nodeCreateReceipt.toString()}`)
          } catch (e) {
            this.logger.error(`Error adding node to network: ${e.message}`, e)
            throw new FullstackTestingError(`Error adding node to network: ${e.message}`, e)
          }
        }
      },
      {
        title: 'Send prepare upgrade transaction',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          await this.prepareUpgradeNetworkNodes(config.freezeAdminPrivateKey, ctx.upgradeZipHash, config.nodeClient)
        }
      },
      {
        title: 'Download generated files from an existing node',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeIds[0])

          // copy the config.txt file from the node1 upgrade directory
          await self.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/config.txt`, config.stagingDir)

          const signedKeyFiles = (await self.k8.listDir(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`)).filter(file => file.name.startsWith(constants.SIGNING_KEY_PREFIX))
          for (const signedKeyFile of signedKeyFiles) {
            await self.k8.execContainer(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `[[ ! -f "${constants.HEDERA_HAPI_PATH}/data/keys/${signedKeyFile.name}" ]] || cp ${constants.HEDERA_HAPI_PATH}/data/keys/${signedKeyFile.name} ${constants.HEDERA_HAPI_PATH}/data/keys/${signedKeyFile.name}.old`])
            await self.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/${signedKeyFile.name}`, `${config.keysDir}`)
          }
        }
      },
      {
        title: 'Send freeze upgrade transaction',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          await this.freezeUpgradeNetworkNodes(config.freezeAdminPrivateKey, ctx.upgradeZipHash, config.nodeClient)
        }
      },
      {
        title: 'Check network nodes are frozen',
        task: (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const subTasks = []
          for (const nodeId of config.existingNodeIds) {
            subTasks.push({
              title: `Check node: ${chalk.yellow(nodeId)}`,
              task: () => self.checkNetworkNodeState(nodeId, 100, 'FREEZE_COMPLETE')
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
      },
      {
        title: 'Deploy new network node',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const index = config.existingNodeIds.length
          let valuesArg = ''
          for (let i = 0; i < index; i++) {
            valuesArg += ` --set "hedera.nodes[${i}].accountId=${config.serviceMap.get(config.existingNodeIds[i]).accountId}" --set "hedera.nodes[${i}].name=${config.existingNodeIds[i]}"`
          }
          valuesArg += ` --set "hedera.nodes[${index}].accountId=${ctx.newNode.accountId}" --set "hedera.nodes[${index}].name=${ctx.newNode.name}"`

          await self.chartManager.upgrade(
            config.namespace,
            constants.FULLSTACK_DEPLOYMENT_CHART,
            config.chartPath,
            valuesArg,
            config.fstChartVersion
          )

          config.allNodeIds = [...config.existingNodeIds, config.nodeId]
        }
      },
      {
        title: 'Check new network node pod is running',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          config.podNames[config.nodeId] = await this.checkNetworkNodePod(config.namespace, config.nodeId)
        }
      },
      {
        title: 'Prepare staging directory',
        task: async (ctx, parentTask) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const subTasks = [
            {
              title: 'Copy configuration files',
              task: () => {
                for (const flag of flags.nodeConfigFileFlags.values()) {
                  const filePath = self.configManager.getFlag(flag)
                  if (!filePath) {
                    throw new FullstackTestingError(`Configuration file path is missing for: ${flag.name}`)
                  }

                  const fileName = path.basename(filePath)
                  const destPath = `${config.stagingDir}/templates/${fileName}`
                  self.logger.debug(`Copying configuration file to staging: ${filePath} -> ${destPath}`)

                  fs.cpSync(filePath, destPath, { force: true })
                }
              }
            },
            {
              title: 'Copy Gossip keys to staging',
              task: async (ctx, _) => {
                const config = /** @type {NodeAddConfigClass} **/ ctx.config

                await this.copyGossipKeysToStaging(config.keyFormat, config.keysDir, config.stagingKeysDir, config.allNodeIds)
              }
            },
            {
              title: 'Copy gRPC TLS keys to staging',
              task: async (ctx, _) => {
                const config = /** @type {NodeAddConfigClass} **/ ctx.config
                for (const nodeId of config.allNodeIds) {
                  const tlsKeyFiles = self.keyManager.prepareTLSKeyFilePaths(nodeId, config.keysDir)
                  await self._copyNodeKeys(tlsKeyFiles, config.stagingKeysDir)
                }
              }
            }
          ]

          return parentTask.newListr(subTasks, {
            concurrent: false,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Fetch platform software into new network node',
        task:
          async (ctx, task) => {
            const config = /** @type {NodeAddConfigClass} **/ ctx.config
            return self.fetchLocalOrReleasedPlatformSoftware(config.nodeIds, config.podNames, config.releaseTag, task)
          }
      },
      {
        title: 'Download last state from an existing node',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeIds[0])
          const upgradeDirectory = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/0/123`
          // zip the contents of the newest folder on node1 within /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/
          const zipFileName = await self.k8.execContainer(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `cd ${upgradeDirectory} && mapfile -t states < <(ls -1t .) && jar cf "\${states[0]}.zip" -C "\${states[0]}" . && echo -n \${states[0]}.zip`])
          await self.k8.copyFrom(node1FullyQualifiedPodName, constants.ROOT_CONTAINER, `${upgradeDirectory}/${zipFileName}`, config.stagingDir)
          config.lastStateZipPath = `${config.stagingDir}/${zipFileName}`
        }
      },
      {
        title: 'Upload last saved state to new network node',
        task:
            async (ctx, task) => {
              const config = /** @type {NodeAddConfigClass} **/ ctx.config
              const newNodeFullyQualifiedPodName = Templates.renderNetworkPodName(config.nodeId)
              const nodeNumber = Templates.nodeNumberFromNodeId(config.nodeId)
              const savedStateDir = (config.lastStateZipPath.match(/\/(\d+)\.zip$/))[1]
              const savedStatePath = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/${nodeNumber}/123/${savedStateDir}`
              await self.k8.execContainer(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `mkdir -p ${savedStatePath}`])
              await self.k8.copyTo(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, config.lastStateZipPath, savedStatePath)
              await self.platformInstaller.setPathPermission(newNodeFullyQualifiedPodName, constants.HEDERA_HAPI_PATH)
              await self.k8.execContainer(newNodeFullyQualifiedPodName, constants.ROOT_CONTAINER, ['bash', '-c', `cd ${savedStatePath} && jar xf ${path.basename(config.lastStateZipPath)} && rm -f ${path.basename(config.lastStateZipPath)}`])
            }
      },
      {
        title: 'Setup new network node',
        task: async (ctx, parentTask) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config

          // modify application.properties to trick Hedera Services into receiving an updated address book
          await self.bumpHederaConfigVersion(`${config.stagingDir}/templates/application.properties`)

          const subTasks = []
          for (const nodeId of config.allNodeIds) {
            const podName = config.podNames[nodeId]
            subTasks.push({
              title: `Node: ${chalk.yellow(nodeId)}`,
              task: () =>
                self.platformInstaller.taskInstall(podName, config.buildZipFile, config.stagingDir, config.allNodeIds, config.keyFormat, config.force)
            })
          }

          // set up the sub-tasks
          return parentTask.newListr(subTasks, {
            concurrent: true,
            rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION
          })
        }
      },
      {
        title: 'Start network nodes',
        task: (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const subTasks = []
          self.startNodes(config.podNames, config.allNodeIds, subTasks)

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
              timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION
            }
          })
        }
      },
      {
        title: 'Check all nodes are ACTIVE',
        task: async (ctx, task) => {
          const subTasks = []
          // sleep for 30 seconds to give time for the logs to roll over to prevent capturing an invalid "ACTIVE" string
          await sleep(30000)
          for (const nodeId of ctx.config.allNodeIds) {
            subTasks.push({
              title: `Check node: ${chalk.yellow(nodeId)}`,
              task: () => self.checkNetworkNodeState(nodeId, 200)
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
      },
      {
        title: 'Check all node proxies are ACTIVE',
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          const subTasks = []
          for (const nodeId of config.allNodeIds) {
            subTasks.push({
              title: `Check proxy for node: ${chalk.yellow(nodeId)}`,
              task: async () => await self.k8.waitForPodReady(
                [`app=haproxy-${nodeId}`, 'fullstack.hedera.com/type=haproxy'],
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
      },
      {
        title: 'Stake new node',
        task: (ctx, _) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          self.addStake(config.namespace, ctx.newNode.accountId, config.nodeId)
        }
      },
      {
        title: 'Trigger stake weight calculate',
        task: async (ctx, task) => {
          const config = /** @type {NodeAddConfigClass} **/ ctx.config
          // sleep 60 seconds for the handler to be able to trigger the network node stake weight recalculate
          await sleep(60000)
          const accountMap = getNodeAccountMap(config.allNodeIds)
          // send some write transactions to invoke the handler that will trigger the stake weight recalculate
          for (const nodeId of config.allNodeIds) {
            const accountId = accountMap.get(nodeId)
            config.nodeClient.setOperator(TREASURY_ACCOUNT_ID, config.treasuryKey)
            await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, accountId, 1)
          }
        }
      },
      {
        title: 'Finalize',
        task: (ctx, _) => {
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
      self.logger.error(`Error in setting up nodes: ${e.message}`, e)
      throw new FullstackTestingError(`Error in setting up nodes: ${e.message}`, e)
    } finally {
      await self.close()
    }

    return true
  }

  async prepareUpgradeNetworkNodes (freezeAdminPrivateKey, upgradeZipHash, client) {
    try {
      // transfer some tiny amount to the freeze admin account
      await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, FREEZE_ADMIN_ACCOUNT, 100000)

      // query the balance
      const balance = await new AccountBalanceQuery()
        .setAccountId(FREEZE_ADMIN_ACCOUNT)
        .execute(this.accountManager._nodeClient)
      this.logger.debug(`Freeze admin account balance: ${balance.hbars}`)

      // set operator of freeze transaction as freeze admin account
      client.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey)

      const prepareUpgradeTx = await new FreezeTransaction()
        .setFreezeType(FreezeType.PrepareUpgrade)
        .setFileId(constants.UPGRADE_FILE_ID)
        .setFileHash(upgradeZipHash)
        .freezeWith(client)
        .execute(client)

      const prepareUpgradeReceipt = await prepareUpgradeTx.getReceipt(client)

      this.logger.debug(
          `sent prepare upgrade transaction [id: ${prepareUpgradeTx.transactionId.toString()}]`,
          prepareUpgradeReceipt.status.toString()
      )
    } catch (e) {
      this.logger.error(`Error in prepare upgrade: ${e.message}`, e)
      throw new FullstackTestingError(`Error in prepare upgrade: ${e.message}`, e)
    }
  }

  async freezeUpgradeNetworkNodes (freezeAdminPrivateKey, upgradeZipHash, client) {
    try {
      const futureDate = new Date()
      this.logger.debug(`Current time: ${futureDate}`)

      futureDate.setTime(futureDate.getTime() + 5000) // 5 seconds in the future
      this.logger.debug(`Freeze time: ${futureDate}`)

      client.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey)
      const freezeUpgradeTx = await new FreezeTransaction()
        .setFreezeType(FreezeType.FreezeUpgrade)
        .setStartTimestamp(Timestamp.fromDate(futureDate))
        .setFileId(constants.UPGRADE_FILE_ID)
        .setFileHash(upgradeZipHash)
        .freezeWith(client)
        .execute(client)

      const freezeUpgradeReceipt = await freezeUpgradeTx.getReceipt(client)
      this.logger.debug(`Upgrade frozen with transaction id: ${freezeUpgradeTx.transactionId.toString()}`,
        freezeUpgradeReceipt.status.toString())
    } catch (e) {
      this.logger.error(`Error in freeze upgrade: ${e.message}`, e)
      throw new FullstackTestingError(`Error in freeze upgrade: ${e.message}`, e)
    }
  }

  startNodes (podNames, nodeIds, subTasks) {
    for (const nodeId of nodeIds) {
      const podName = podNames[nodeId]
      subTasks.push({
        title: `Start node: ${chalk.yellow(nodeId)}`,
        task: async () => {
          await this.k8.execContainer(podName, constants.ROOT_CONTAINER, ['systemctl', 'restart', 'network-node'])
        }
      })
    }
  }

  async copyGossipKeysToStaging (keyFormat, keysDir, stagingKeysDir, nodeIds) {
    // copy gossip keys to the staging
    for (const nodeId of nodeIds) {
      switch (keyFormat) {
        case constants.KEY_FORMAT_PEM: {
          const signingKeyFiles = this.keyManager.prepareNodeKeyFilePaths(nodeId, keysDir, constants.SIGNING_KEY_PREFIX)
          await this._copyNodeKeys(signingKeyFiles, stagingKeysDir)

          // generate missing agreement keys
          const agreementKeyFiles = this.keyManager.prepareNodeKeyFilePaths(nodeId, keysDir, constants.AGREEMENT_KEY_PREFIX)
          await this._copyNodeKeys(agreementKeyFiles, stagingKeysDir)
          break
        }

        case constants.KEY_FORMAT_PFX: {
          const privateKeyFile = Templates.renderGossipPfxPrivateKeyFile(nodeId)
          fs.cpSync(`${keysDir}/${privateKeyFile}`, `${stagingKeysDir}/${privateKeyFile}`)
          fs.cpSync(`${keysDir}/${constants.PUBLIC_PFX}`, `${stagingKeysDir}/${constants.PUBLIC_PFX}`)
          break
        }

        default:
          throw new FullstackTestingError(`Unsupported key-format ${keyFormat}`)
      }
    }
  }

  // Command Definition
  /**
   * Return Yargs command definition for 'node' command
   * @param nodeCmd an instance of NodeCommand
   */
  static getCommandDefinition (nodeCmd) {
    if (!nodeCmd || !(nodeCmd instanceof NodeCommand)) {
      throw new IllegalArgumentError('An instance of NodeCommand is required', nodeCmd)
    }
    return {
      command: 'node',
      desc: 'Manage Hedera platform node in fullstack testing network',
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
            builder: y => flags.setCommandFlags(y,
              flags.app,
              flags.namespace,
              flags.nodeIDs
            ),
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
            builder: y => flags.setCommandFlags(y,
              flags.namespace,
              flags.nodeIDs
            ),
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
              flags.nodeIDs
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
          .demandCommand(1, 'Select a node command')
      }
    }
  }

  async bumpHederaConfigVersion (configTxtPath) {
    const lines = (await readFile(configTxtPath, 'utf-8')).split('\n')

    for (const line of lines) {
      if (line.startsWith('hedera.config.version=')) {
        const version = parseInt(line.split('=')[1]) + 1
        lines[lines.indexOf(line)] = `hedera.config.version=${version}`
        break
      }
    }

    await writeFile(configTxtPath, lines.join('\n'))
  }
}
