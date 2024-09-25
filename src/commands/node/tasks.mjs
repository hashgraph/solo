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
import { constants, Templates, Task } from '../../core/index.mjs'
import { FREEZE_ADMIN_ACCOUNT } from '../../core/constants.mjs'
import { AccountBalanceQuery, FreezeTransaction, FreezeType, Timestamp } from '@hashgraph/sdk'
import { FullstackTestingError, IllegalArgumentError } from '../../core/errors.mjs'
import * as prompts from '../prompts.mjs'
import * as flags from '../flags.mjs'
import * as helpers from '../../core/helpers.mjs'

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

  sendPrepareUpgradeTransaction () {
    return new Task('Send prepare upgrade transaction', async (ctx, task) => {
      const { freezeAdminPrivateKey, upgradeZipHash, client } = ctx.config
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
    })
  }

  sendFreezeUpgradeTransaction () {
    return new Task('Send freeze upgrade transaction', async (ctx, task) => {
      const { freezeAdminPrivateKey, upgradeZipHash, client } = ctx.config
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
    })
  }

  /**
     * Download generated config files and key files from the network node
     */
  async downloadNodeGeneratedFiles () {
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

  async initialize (flagList = []) {
    return new Task('Initialize', async (ctx, task) => {
      this.configManager.update(argv)

      // disable the prompts that we don't want to prompt the user for
      prompts.disablePrompts([
        flags.app,
        flags.appConfig,
        flags.devMode,
        flags.localBuildPath
      ])

      await prompts.execute(task, this.configManager, flagList)

      /**
             * @typedef {Object} NodeSetupConfigClass
             * -- flags --
             * @property {string} app
             * @property {string} appConfig
             * @property {string} cacheDir
             * @property {boolean} devMode
             * @property {string} localBuildPath
             * @property {string} namespace
             * @property {string} nodeIDs
             * @property {string} releaseTag
             * -- extra args --
             * @property {string[]} nodeIds
             * @property {string[]} podNames
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
          'nodeIds',
          'podNames'
        ])

      config.nodeIds = helpers.parseNodeIds(config.nodeIDs)

      await self.initializeSetup(config, self.k8)

      // set config in the context for later tasks to use
      ctx.config = config

      this.logger.debug('Initialized config', { config })
    })
  }
}
