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
import { FREEZE_ADMIN_ACCOUNT } from '../../core/constants.mjs'
import {
  AccountBalanceQuery,
  FileAppendTransaction,
  FileUpdateTransaction,
  FreezeTransaction,
  FreezeType, PrivateKey,
  Timestamp
} from '@hashgraph/sdk'
import { SoloError, IllegalArgumentError, MissingArgumentError } from '../../core/errors.mjs'
import * as prompts from '../prompts.mjs'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { getNodeAccountMap } from '../../core/helpers.mjs'
import chalk from 'chalk'
import * as flags from '../flags.mjs'

export class NodeCommandTasks {
  /**
     * @param {{logger: Logger, accountManager: AccountManager, configManager: ConfigManager}} opts
     */
  constructor (opts) {
    if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
    if (!opts || !opts.configManager) throw new Error('An instance of core/ConfigManager is required')
    if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required')
    if (!opts || !opts.k8) throw new Error('An instance of core/K8 is required')

    this.accountManager = opts.accountManager
    this.configManager = opts.configManager
    this.logger = opts.logger
    this.k8 = /** @type {K8} **/ opts.k8
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

  prepareUpgradeZip () {
    return new Task('Prepare upgrade zip file for node upgrade process', async (ctx, task) => {
      const config = ctx.config
      ctx.upgradeZipFile = await this._prepareUpgradeZip(config.stagingDir)
      ctx.upgradeZipHash = await this._uploadUpgradeZip(ctx.upgradeZipFile, config.nodeClient)
    })
  }

  loadAdminKey () {
    return new Task('Load node admin key', async (ctx, task) => {
      const config = ctx.config
      config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY)
    })
  }

  checkExistingNodesStakedAmount () {
    return new Task('Check existing nodes staked amount', async (ctx, task) => {
      const config = ctx.config

      // Transfer some hbar to the node for staking purpose
      const accountMap = getNodeAccountMap(config.existingNodeIds)
      for (const nodeId of config.existingNodeIds) {
        const accountId = accountMap.get(nodeId)
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
      const node1FullyQualifiedPodName = Templates.renderNetworkPodName(config.existingNodeIds[0])

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
   * @param {string[]} nodeIds
   * @returns {*}
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
   * Check if the network node pod is running
   * @param {string} namespace
   * @param {string} nodeId
   * @param {number} [maxAttempts]
   * @param {number} [delay]
   * @returns {Promise<string>}
   */
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
      throw new SoloError(`no pod found for nodeId: ${nodeId}`, e)
    }
  }

  identifyExistingNodes () {
    return new Task('Identify existing network nodes', async (ctx, task) => {
      const config = ctx.config
      config.existingNodeIds = []
      config.serviceMap = await this.accountManager.getNodeServiceMap(config.namespace)
      for (/** @type {NetworkNodeServices} **/ const networkNodeServices of config.serviceMap.values()) {
        config.existingNodeIds.push(networkNodeServices.nodeName)
      }
      config.allNodeIds = [...config.existingNodeIds]
      return this.taskCheckNetworkNodePods(ctx, task, config.existingNodeIds)
    })
  }

  identifyNetworkPods () {
    return new Task('Identify network pods', async (ctx, task) => {
      return this.taskCheckNetworkNodePods(ctx, task, ctx.config.nodeIds)
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
      prompts.disablePrompts(requiredFlagsWithDisabledPrompt)
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
