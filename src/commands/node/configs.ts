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
import { FREEZE_ADMIN_ACCOUNT } from '../../core/constants'

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
