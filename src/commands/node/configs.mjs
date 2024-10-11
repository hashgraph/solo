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
import { FREEZE_ADMIN_ACCOUNT } from '../../core/constants.mjs'
import { constants, Templates } from '../../core/index.mjs'
import { PrivateKey } from '@hashgraph/sdk'
import { SoloError } from '../../core/errors.mjs'
import * as helpers from '../../core/helpers.mjs'
import path from 'path'
import fs from 'fs'
import { validatePath } from '../../core/helpers.mjs'
import * as flags from '../flags.mjs'

export const PREPARE_UPGRADE_CONFIGS_NAME = 'prepareUpgradeConfig'
export const DOWNLOAD_GENERATED_FILES_CONFIGS_NAME = 'downloadGeneratedFilesConfig'
export const ADD_CONFIGS_NAME = 'addConfigs'
export const DELETE_CONFIGS_NAME = 'deleteConfigs'
export const UPDATE_CONFIGS_NAME = 'updateConfigs'
export const REFRESH_CONFIGS_NAME = 'refreshConfigs'
export const KEYS_CONFIGS_NAME = 'keyConfigs'
export const SETUP_CONFIGS_NAME = 'setupConfigs'
export const START_CONFIGS_NAME = 'startConfigs'

const initializeSetup = async (config, k8) => {
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

  await initializeSetup(config, this.k8)
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
  await initializeSetup(config, this.k8)

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
     * @property {string} soloChartVersion
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
  const config = /** @type {NodeUpdateConfigClass} **/ this.getConfig(UPDATE_CONFIGS_NAME, argv.flags,
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

  await initializeSetup(config, this.k8)

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

  return config
}

export const deleteConfigBuilder = async function (argv, ctx, task) {
  /**
     * @typedef {Object} NodeDeleteConfigClass
     * -- flags --
     * @property {string} app
     * @property {string} cacheDir
     * @property {string} chartDirectory
     * @property {boolean} devMode
     * @property {string} debugNodeAlias
     * @property {string} endpointType
     * @property {string} soloChartVersion
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
  const config = /** @type {NodeDeleteConfigClass} **/ this.getConfig(DELETE_CONFIGS_NAME, argv.flags,
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

  await initializeSetup(config, this.k8)

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

  return config
}

export const addConfigBuilder = async function (argv, ctx, task) {
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
     * @property {string} soloChartVersion
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
  const config = /** @type {NodeAddConfigClass} **/ this.getConfig(ADD_CONFIGS_NAME, argv.flags,
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

  await initializeSetup(config, this.k8)

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

  return config
}

export const logsConfigBuilder = function (argv, ctx, task) {
  /** @type {{namespace: string, nodeAliases: NodeAliases}} */
  const config = {
    namespace: this.configManager.getFlag(flags.namespace),
    nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed))
  }
  ctx.config = config
  return config
}

export const refreshConfigBuilder = async function (argv, ctx, task) {
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
  ctx.config = /** @type {NodeRefreshConfigClass} **/ this.getConfig(REFRESH_CONFIGS_NAME, argv.flags,
    [
      'nodeAliases',
      'podNames'
    ])

  ctx.config.nodeAliases = helpers.parseNodeAliases(ctx.config.nodeAliasesUnparsed)

  await initializeSetup(ctx.config, this.k8)

  return ctx.config
}

export const keysConfigBuilder = function (argv, ctx, task) {
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
  const config = /** @type {NodeKeysConfigClass} **/ this.getConfig(KEYS_CONFIGS_NAME, argv.flags,
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
  return config
}

export const stopConfigBuilder = async function (argv, ctx, task) {
  /** @type {{namespace: string, nodeAliases: NodeAliases}} */
  ctx.config = {
    namespace: this.configManager.getFlag(flags.namespace),
    nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed)),
    nodeAliasesUnparsed: this.configManager.getFlag(flags.nodeAliasesUnparsed)
  }

  if (!await this.k8.hasNamespace(ctx.config.namespace)) {
    throw new SoloError(`namespace ${ctx.config.namespace} does not exist`)
  }

  return ctx.config
}

export const startConfigBuilder = async function (argv, ctx, task) {
  // /**
  //    * @typedef {Object} NodeStartConfigClass
  //    * -- flags --
  //    * @property {string} app
  //    * @property {string} appConfig
  //    * @property {string} cacheDir
  //    * @property {boolean} devMode
  //    * @property {string} namespace
  //    * @property {string} nodeAliasesUnparsed
  //    * @property {string} debugNodeAlias
  //    * -- extra args --
  //    * @property {NodeAliases} nodeAliases
  //    * -- methods --
  //    * @property {getUnusedConfigs} getUnusedConfigs
  //    */
  // /**
  //    * @callback getUnusedConfigs
  //    * @returns {string[]}
  //    */
  //
  // // create a config object for subsequent steps
  // const config = /** @type {NodeStartConfigClass} **/ this.getConfig(START_CONFIGS_NAME, argv.flags,
  //   [
  //     'nodeAliases'
  //   ])
  //
  // if (!await this.k8.hasNamespace(config.namespace)) {
  //   throw new SoloError(`namespace ${config.namespace} does not exist`)
  // }
  //
  // config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed)
  //
  // return config


    ctx.config = {
        app: this.configManager.getFlag(flags.app),
        cacheDir: this.configManager.getFlag(flags.cacheDir),
        debugNodeAlias: this.configManager.getFlag(flags.debugNodeAlias),
        namespace: this.configManager.getFlag(flags.namespace),
        nodeAliases: helpers.parseNodeAliases(this.configManager.getFlag(flags.nodeAliasesUnparsed))
    }

    ctx.config.stagingDir = Templates.renderStagingDir(
        this.configManager.getFlag(flags.cacheDir),
        this.configManager.getFlag(flags.releaseTag)
    )

    if (!await this.k8.hasNamespace(ctx.config.namespace)) {
        throw new SoloError(`namespace ${ctx.config.namespace} does not exist`)
    }

    return ctx.config
}

export const setupConfigBuilder = async function (argv, ctx, task) {
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
  const config = /** @type {NodeSetupConfigClass} **/ this.getConfig(SETUP_CONFIGS_NAME, argv.flags,
    [
      'nodeAliases',
      'podNames'
    ])

  config.nodeAliases = helpers.parseNodeAliases(config.nodeAliasesUnparsed)

  await initializeSetup(config, this.k8)

  // set config in the context for later tasks to use
  ctx.config = config

  return ctx.config
}
