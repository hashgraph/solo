import * as flags from "../flags.mjs";
import {FREEZE_ADMIN_ACCOUNT} from "../../core/constants.mjs";

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
            'allNodeIds',
            'existingNodeIds',
            'serviceMap'
        ])

    config.existingNodeIds = []
    await this.initializeSetup(config, this.k8)

    return config
}