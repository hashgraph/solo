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
import * as flags from '../flags.mjs'
import { FREEZE_ADMIN_ACCOUNT } from '../../core/constants.mjs'
import * as NodeFlags from "./flags.mjs";
import {constants} from "../../core/index.mjs";
import {PrivateKey} from "@hashgraph/sdk";

export const PREPARE_UPGRADE_CONFIGS_NAME = 'prepareUpgradeConfig'
export const DOWNLOAD_GENERATED_FILES_CONFIGS_NAME = 'downloadGeneratedFilesConfig'

export const prepareUpgradeConfigBuilder = async function (argv, ctx, task) {
  /**
     * @typedef {Object} NodePrepareUpgradeConfigClass
     * -- flags --
     * @property {string} cacheDir
     * @property {string} namespace
     * @property {string} releaseTag
     * -- extra args --
     * @property {string} freezeAdminPrivateKey
     * @property {Object} nodeClient
     * -- methods --
     * @property {getUnusedConfigs} getUnusedConfigs
     */
  /**
     * @callback getUnusedConfigs
     * @returns {string[]}
     */

  const config = /** @type {NodePrepareUpgradeConfigClass} **/ this.getConfig(
    PREPARE_UPGRADE_CONFIGS_NAME, argv.flags, [
      'nodeClient',
      'freezeAdminPrivateKey'
    ])

  await this.initializeSetup(config, this.k8)
  config.nodeClient = await this.accountManager.loadNodeClient(config.namespace)

  const accountKeys = await this.accountManager.getAccountKeysFromSecret(FREEZE_ADMIN_ACCOUNT, config.namespace)
  config.freezeAdminPrivateKey = accountKeys.privateKey

  return config
}

export const downloadGeneratedFilesConfigBuilder = async function (argv, ctx, task) {
  /**
     * @typedef {Object} NodeDownloadGeneratedFilesConfigClass
     * -- flags --
     * @property {string} cacheDir
     * @property {string} namespace
     * @property {string} releaseTag
     * -- extra args --
     * @property {string} freezeAdminPrivateKey
     * @property {Object} nodeClient
     * -- methods --
     * @property {getUnusedConfigs} getUnusedConfigs
     */
  /**
     * @callback getUnusedConfigs
     * @returns {string[]}
     */

  const config = /** @type {NodePrepareUpgradeConfigClass} **/ this.getConfig(
    DOWNLOAD_GENERATED_FILES_CONFIGS_NAME, argv.flags, [
      'allNodeAliases',
      'existingNodeAliases',
      'serviceMap'
    ])

  config.existingNodeAliases = []
  await this.initializeSetup(config, this.k8)

  return config
}


export const updateConfigBuilder = async function (argv, ctx, task) {
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

    return config
}