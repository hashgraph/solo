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
import * as fs from 'fs'
import { Listr } from 'listr2'
import * as path from 'path'
import { SoloError, IllegalArgumentError, MissingArgumentError } from './errors.mjs'
import { constants } from './index.mjs'
import { Templates } from './templates.mjs'
import { flags } from '../commands/index.mjs'
import * as Base64 from 'js-base64'
import chalk from 'chalk'

/**
 * PlatformInstaller install platform code in the root-container of a network pod
 */
export class PlatformInstaller {
  /**
   * @param {SoloLogger} logger
   * @param {K8} k8
   * @param {ConfigManager} configManager
   * @param {AccountManager} accountManager
   */
  constructor (logger, k8, configManager, accountManager) {
    if (!logger) throw new MissingArgumentError('an instance of core/SoloLogger is required')
    if (!k8) throw new MissingArgumentError('an instance of core/K8 is required')
    if (!configManager) throw new MissingArgumentError('an instance of core/ConfigManager is required')
    if (!accountManager) throw new MissingArgumentError('an instance of core/AccountManager is required')

    this.logger = logger
    this.k8 = k8
    this.configManager = configManager
    this.accountManager = accountManager
  }

  /**
   * @returns {string}
   * @private
   */
  _getNamespace () {
    const ns = this.configManager.getFlag(flags.namespace)
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }

  /**
   * @param {string} releaseDir
   * @returns {void}
   */
  validatePlatformReleaseDir (releaseDir) {
    if (!releaseDir) throw new MissingArgumentError('releaseDir is required')
    if (!fs.existsSync(releaseDir)) {
      throw new IllegalArgumentError('releaseDir does not exists', releaseDir)
    }

    const dataDir = `${releaseDir}/data`
    const appsDir = `${releaseDir}/${constants.HEDERA_DATA_APPS_DIR}`
    const libDir = `${releaseDir}/${constants.HEDERA_DATA_LIB_DIR}`

    if (!fs.existsSync(dataDir)) {
      throw new IllegalArgumentError('releaseDir does not have data directory', releaseDir)
    }

    if (!fs.existsSync(appsDir)) {
      throw new IllegalArgumentError(`'${constants.HEDERA_DATA_APPS_DIR}' missing in '${releaseDir}'`, releaseDir)
    }

    if (!fs.existsSync(libDir)) {
      throw new IllegalArgumentError(`'${constants.HEDERA_DATA_LIB_DIR}' missing in '${releaseDir}'`, releaseDir)
    }

    if (!fs.statSync(appsDir).isEmpty()) {
      throw new IllegalArgumentError(`'${constants.HEDERA_DATA_APPS_DIR}' is empty in releaseDir: ${releaseDir}`, releaseDir)
    }

    if (!fs.statSync(libDir).isEmpty()) {
      throw new IllegalArgumentError(`'${constants.HEDERA_DATA_LIB_DIR}' is empty in releaseDir: ${releaseDir}`, releaseDir)
    }
  }

  /**
   * Fetch and extract platform code into the container
   * @param {PodName} podName
   * @param {string} tag - platform release tag
   * @returns {Promise<boolean>}
   */
  async fetchPlatform (podName, tag) {
    if (!podName) throw new MissingArgumentError('podName is required')
    if (!tag) throw new MissingArgumentError('tag is required')

    try {
      const scriptName = 'extract-platform.sh'
      const sourcePath = path.join(constants.RESOURCES_DIR, scriptName) // script source path
      await this.copyFiles(podName, [sourcePath], constants.HEDERA_USER_HOME_DIR)

      const extractScript = path.join(constants.HEDERA_USER_HOME_DIR, scriptName) // inside the container
      await this.k8.execContainer(podName, constants.ROOT_CONTAINER, `chmod +x ${extractScript}`)
      await this.k8.execContainer(podName, constants.ROOT_CONTAINER, [extractScript, tag])
      return true
    } catch (e) {
      throw new SoloError(`failed to extract platform code in this pod '${podName}': ${e.message}`, e)
    }
  }

  /**
   * Copy a list of files to a directory in the container
   *
   * @param {PodName} podName
   * @param {string[]} srcFiles - list of source files
   * @param {string} destDir - destination directory
   * @param {string} [container] - name of the container
   * @returns {Promise<string[]>} list of pathso of the copied files insider the container
   */
  async copyFiles (podName, srcFiles, destDir, container = constants.ROOT_CONTAINER) {
    try {
      const copiedFiles = []

      // prepare the file mapping
      for (const srcPath of srcFiles) {
        if (!fs.existsSync(srcPath)) {
          throw new SoloError(`file does not exist: ${srcPath}`)
        }

        if (!await this.k8.hasDir(podName, container, destDir)) {
          await this.k8.mkdir(podName, container, destDir)
        }

        this.logger.debug(`Copying file into ${podName}: ${srcPath} -> ${destDir}`)
        await this.k8.copyTo(podName, container, srcPath, destDir)

        const fileName = path.basename(srcPath)
        copiedFiles.push(path.join(destDir, fileName))
      }

      return copiedFiles
    } catch (e) {
      throw new SoloError(`failed to copy files to pod '${podName}': ${e.message}`, e)
    }
  }

  /**
   * @param {NodeAlias} nodeAlias
   * @param {string} stagingDir
   * @param {NodeAliases} nodeAliases
   * @returns {Promise<void>}
   */
  async copyGossipKeys (nodeAlias, stagingDir, nodeAliases) {
    if (!nodeAlias) throw new MissingArgumentError('nodeAlias is required')
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required')
    if (!nodeAliases || nodeAliases.length <= 0) throw new MissingArgumentError('nodeAliases cannot be empty')

    try {
      const srcFiles = []

      // copy private keys for the node
      srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, nodeAlias)))

      // copy all public keys for all nodes
      nodeAliases.forEach(nodeAlias => {
        srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, nodeAlias)))
      })

      const data = {}
      for (const srcFile of srcFiles) {
        const fileContents = fs.readFileSync(srcFile)
        const fileName = path.basename(srcFile)
        data[fileName] = Base64.encode(fileContents)
      }

      if (!await this.k8.createSecret(
        Templates.renderGossipKeySecretName(nodeAlias),
        this._getNamespace(), 'Opaque', data,
        Templates.renderGossipKeySecretLabelObject(nodeAlias), true)) {
        throw new SoloError(`failed to create secret for gossip keys for node '${nodeAlias}'`)
      }
    } catch (e) {
      this.logger.error(`failed to copy gossip keys to secret '${Templates.renderGossipKeySecretName(nodeAlias)}': ${e.message}`, e)
      throw new SoloError(`failed to copy gossip keys to secret '${Templates.renderGossipKeySecretName(nodeAlias)}': ${e.message}`, e)
    }
  }

  /**
   * @param {NodeAliases} nodeAliases
   * @param {string} stagingDir
   * @returns {Promise<void>}
   */
  async copyTLSKeys (nodeAliases, stagingDir) {
    if (!nodeAliases || nodeAliases.length <= 0) throw new MissingArgumentError('nodeAliases cannot be empty')
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required')

    try {
      const data = {}

      for (const nodeAlias of nodeAliases) {
        const srcFiles = []
        srcFiles.push(path.join(stagingDir, 'keys', Templates.renderTLSPemPrivateKeyFile(nodeAlias)))
        srcFiles.push(path.join(stagingDir, 'keys', Templates.renderTLSPemPublicKeyFile(nodeAlias)))

        for (const srcFile of srcFiles) {
          const fileContents = fs.readFileSync(srcFile)
          const fileName = path.basename(srcFile)
          data[fileName] = Base64.encode(fileContents)
        }
      }
      if (!await this.k8.createSecret(
        'network-node-hapi-app-secrets',
        this._getNamespace(), 'Opaque', data,
        undefined, true)) {
        throw new SoloError('failed to create secret for TLS keys')
      }
    } catch (e) {
      this.logger.error('failed to copy TLS keys to secret', e)
      throw new SoloError('failed to copy TLS keys to secret', e)
    }
  }

  /**
   * @param {PodName} podName
   * @param {string} destPath
   * @param {string} [mode]
   * @param {boolean} [recursive]
   * @param {string} [container]
   * @returns {Promise<boolean>}
   */
  async setPathPermission (podName, destPath, mode = '0755', recursive = true, container = constants.ROOT_CONTAINER) {
    if (!podName) throw new MissingArgumentError('podName is required')
    if (!destPath) throw new MissingArgumentError('destPath is required')

    const recursiveFlag = recursive ? '-R' : ''
    try {
      await this.k8.execContainer(podName, container, `chown ${recursiveFlag} hedera:hedera ${destPath}`)
    } catch (e) {
      // ignore error, can't change settings on files that come from configMaps or secrets
    }
    try {
      await this.k8.execContainer(podName, container, `chmod ${recursiveFlag} ${mode} ${destPath}`)
    } catch (e) {
      // ignore error, can't change settings on files that come from configMaps or secrets
    }

    return true
  }

  /**
   * @param {PodName} podName
   * @returns {Promise<boolean>}
   */
  async setPlatformDirPermissions (podName) {
    const self = this
    if (!podName) throw new MissingArgumentError('podName is required')

    try {
      const destPaths = [
        constants.HEDERA_HAPI_PATH
      ]

      for (const destPath of destPaths) {
        await self.setPathPermission(podName, destPath)
      }

      return true
    } catch (e) {
      throw new SoloError(`failed to set permission in '${podName}'`, e)
    }
  }

  /**
   * Return a list of task to perform node directory setup
   *
   * @param {PodName} podName
   * @returns {Listr<ListrContext, ListrPrimaryRendererValue, ListrSecondaryRendererValue>}
   */
  taskSetup (podName) {
    const self = this
    return new Listr([
      {
        title: 'Set file permissions',
        task: async () =>
          await self.setPlatformDirPermissions(podName)
      }
    ],
    {
      concurrent: false,
      rendererOptions: {
        collapseSubtasks: false
      }
    })
  }

  /**
   * Return a list of task to copy the node keys to the staging directory
   *
   * It assumes the staging directory has the following files and resources:
   * <li>${staging}/keys/s-public-<nodeAlias>.pem: private signing key for a node</li>
   * <li>${staging}/keys/s-private-<nodeAlias>.pem: public signing key for a node</li>
   * <li>${staging}/keys/a-public-<nodeAlias>.pem: private agreement key for a node</li>
   * <li>${staging}/keys/a-private-<nodeAlias>.pem: public agreement key for a node</li>
   * <li>${staging}/keys/hedera-<nodeAlias>.key: gRPC TLS key for a node</li>
   * <li>${staging}/keys/hedera-<nodeAlias>.crt: gRPC TLS cert for a node</li>
   *
   * @param stagingDir staging directory path
   * @param {NodeAliases} nodeAliases list of node ids
   * @returns {Listr<ListrContext, ListrPrimaryRendererValue, ListrSecondaryRendererValue>}
   */
  copyNodeKeys (stagingDir, nodeAliases) {
    const self = this
    const subTasks = []
    subTasks.push({
      title: 'Copy TLS keys',
      task: async () =>
        await self.copyTLSKeys(nodeAliases, stagingDir)
    })

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Node: ${chalk.yellow(nodeAlias)}`,
        task: () => new Listr([{
          title: 'Copy Gossip keys',
          task: async () =>
            await self.copyGossipKeys(nodeAlias, stagingDir, nodeAliases)
        }
        ],
        {
          concurrent: false,
          rendererOptions: {
            collapseSubtasks: false
          }
        })
      })
    }
    return subTasks
  }
}
