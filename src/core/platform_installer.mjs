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
import * as fs from 'fs'
import * as os from 'os'
import { Listr } from 'listr2'
import * as path from 'path'
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from './errors.mjs'
import { constants } from './index.mjs'
import { Templates } from './templates.mjs'
import { flags } from '../commands/index.mjs'

/**
 * PlatformInstaller install platform code in the root-container of a network pod
 */
export class PlatformInstaller {
  constructor (logger, k8, configManager, accountManager) {
    if (!logger) throw new MissingArgumentError('an instance of core/Logger is required')
    if (!k8) throw new MissingArgumentError('an instance of core/K8 is required')
    if (!configManager) throw new MissingArgumentError('an instance of core/ConfigManager is required')
    if (!accountManager) throw new MissingArgumentError('an instance of core/AccountManager is required')

    this.logger = logger
    this.k8 = k8
    this.configManager = configManager
    this.accountManager = accountManager
  }

  _getNamespace () {
    const ns = this.configManager.getFlag(flags.namespace)
    if (!ns) throw new MissingArgumentError('namespace is not set')
    return ns
  }

  async validatePlatformReleaseDir (releaseDir) {
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
   * @param podName pod name
   * @param tag platform release tag
   * @return {Promise<boolean|undefined>}
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
      throw new FullstackTestingError(`failed to extract platform code in this pod '${podName}': ${e.message}`, e)
    }
  }

  /**
   * Copy a list of files to a directory in the container
   *
   * @param podName pod name
   * @param srcFiles list of source files
   * @param destDir destination directory
   * @param container name of the container
   *
   * @return {Promise<string[]>} list of pathso of the copied files insider the container
   */
  async copyFiles (podName, srcFiles, destDir, container = constants.ROOT_CONTAINER) {
    try {
      const copiedFiles = []

      // prepare the file mapping
      for (const srcPath of srcFiles) {
        if (!fs.existsSync(srcPath)) {
          throw new FullstackTestingError(`file does not exist: ${srcPath}`)
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
      throw new FullstackTestingError(`failed to copy files to pod '${podName}': ${e.message}`, e)
    }
  }

  async copyGossipKeys (podName, stagingDir, nodeIds, keyFormat = constants.KEY_FORMAT_PEM) {
    const self = this

    if (!podName) throw new MissingArgumentError('podName is required')
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required')
    if (!nodeIds || nodeIds.length <= 0) throw new MissingArgumentError('nodeIds cannot be empty')

    try {
      const keysDir = `${constants.HEDERA_HAPI_PATH}/data/keys`
      const nodeId = Templates.extractNodeIdFromPodName(podName)
      const srcFiles = []

      switch (keyFormat) {
        case constants.KEY_FORMAT_PEM:
          // copy private keys for the node
          srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, nodeId)))
          srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPemPrivateKeyFile(constants.AGREEMENT_KEY_PREFIX, nodeId)))

          // copy all public keys for all nodes
          nodeIds.forEach(id => {
            srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, id)))
            srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPemPublicKeyFile(constants.AGREEMENT_KEY_PREFIX, id)))
          })
          break
        case constants.KEY_FORMAT_PFX:
          srcFiles.push(path.join(stagingDir, 'keys', Templates.renderGossipPfxPrivateKeyFile(nodeId)))
          srcFiles.push(path.join(stagingDir, 'keys', constants.PUBLIC_PFX))
          break
        default:
          throw new FullstackTestingError(`Unsupported key file format ${keyFormat}`)
      }

      return await self.copyFiles(podName, srcFiles, keysDir)
    } catch (e) {
      throw new FullstackTestingError(`failed to copy gossip keys to pod '${podName}': ${e.message}`, e)
    }
  }

  async copyTLSKeys (podName, stagingDir) {
    if (!podName) throw new MissingArgumentError('podName is required')
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required')

    try {
      const nodeId = Templates.extractNodeIdFromPodName(podName)
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${nodeId}-tls-keys-`))

      // rename files appropriately in the tmp directory
      fs.cpSync(path.join(stagingDir, 'keys', Templates.renderTLSPemPrivateKeyFile(nodeId)),
        path.join(tmpDir, 'hedera.key'))
      fs.cpSync(path.join(stagingDir, 'keys', Templates.renderTLSPemPublicKeyFile(nodeId)),
        path.join(tmpDir, 'hedera.crt'))

      const srcFiles = []
      srcFiles.push(path.join(tmpDir, 'hedera.key'))
      srcFiles.push(path.join(tmpDir, 'hedera.crt'))

      return this.copyFiles(podName, srcFiles, constants.HEDERA_HAPI_PATH)
    } catch (e) {
      throw new FullstackTestingError(`failed to copy TLS keys to pod '${podName}': ${e.message}`, e)
    }
  }

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
      throw new FullstackTestingError(`failed to set permission in '${podName}'`, e)
    }
  }

  /**
   * Return a list of task to perform node installation
   *
   * It assumes the staging directory has the following files and resources:
   *   ${staging}/keys/s-<nodeId>.key: signing key for a node
   *   ${staging}/keys/s-<nodeId>.crt: signing cert for a node
   *   ${staging}/keys/a-<nodeId>.key: agreement key for a node
   *   ${staging}/keys/a-<nodeId>.crt: agreement cert for a node
   *   ${staging}/keys/hedera-<nodeId>.key: gRPC TLS key for a node
   *   ${staging}/keys/hedera-<nodeId>.crt: gRPC TLS cert for a node
   *
   * @param podName name of the pod
   * @param stagingDir staging directory path
   * @param nodeIds list of node ids
   * @param keyFormat key format (pfx or pem)
   * @param force force flag
   * @returns {Listr<ListrContext, ListrPrimaryRendererValue, ListrSecondaryRendererValue>}
   */
  taskInstall (podName, stagingDir, nodeIds, keyFormat = constants.KEY_FORMAT_PEM, force = false) {
    const self = this
    return new Listr([
      {
        title: 'Copy Gossip keys',
        task: (_, task) =>
          self.copyGossipKeys(podName, stagingDir, nodeIds, keyFormat)
      },
      {
        title: 'Copy TLS keys',
        task: (_, task) =>
          self.copyTLSKeys(podName, stagingDir, keyFormat)
      },
      {
        title: 'Set file permissions',
        task: (_, task) =>
          self.setPlatformDirPermissions(podName)
      }
    ],
    {
      concurrent: false,
      rendererOptions: {
        collapseSubtasks: false
      }
    }
    )
  }
}
