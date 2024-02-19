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
import * as helpers from './helpers.mjs'

/**
 * PlatformInstaller install platform code in the root-container of a network pod
 */
export class PlatformInstaller {
  constructor (logger, k8) {
    if (!logger) throw new MissingArgumentError('an instance of core/Logger is required')
    if (!k8) throw new MissingArgumentError('an instance of core/K8 is required')

    this.logger = logger
    this.k8 = k8
  }

  /**
   * Setup directories
   * @param podName
   * @param containerName
   * @return {Promise<boolean>}
   */
  async resetHapiDirectories (podName, containerName = constants.ROOT_CONTAINER) {
    if (!podName) throw new MissingArgumentError('podName is required')

    try {
      // reset data directory
      // Note: we cannot delete the data/stats and data/saved as those are volume mounted
      const resetPaths = [
        `${constants.HEDERA_HAPI_PATH}/data/apps`,
        `${constants.HEDERA_HAPI_PATH}/data/config`,
        `${constants.HEDERA_HAPI_PATH}/data/keys`,
        `${constants.HEDERA_HAPI_PATH}/data/lib`,
        `${constants.HEDERA_HAPI_PATH}/data/upgrade`
      ]

      for (const p of resetPaths) {
        await this.k8.execContainer(podName, containerName, `rm -rf ${p}`)
        await this.k8.execContainer(podName, containerName, `mkdir ${p}`)
      }

      await this.setPathPermission(podName, constants.HEDERA_SERVICES_PATH)

      return true
    } catch (e) {
      throw new FullstackTestingError(`failed to setup directories in pod '${podName}': ${e.message}`, e)
    }
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

  async copyPlatform (podName, buildZipSrc) {
    if (!podName) throw new MissingArgumentError('podName is required')
    if (!buildZipSrc) throw new MissingArgumentError('buildZipSrc is required')
    if (!fs.statSync(buildZipSrc).isFile()) throw new IllegalArgumentError('buildZipFile does not exists', buildZipSrc)

    try {
      await this.copyFiles(podName, [buildZipSrc], constants.HEDERA_USER_HOME_DIR)
      return this.extractPlatform(podName, buildZipSrc)
    } catch (e) {
      throw new FullstackTestingError(`failed to copy platform code in to pod '${podName}': ${e.message}`, e)
    }
  }

  async extractPlatform (podName, buildZipSrc) {
    if (!podName) throw new MissingArgumentError('podName is required')
    if (!buildZipSrc) throw new MissingArgumentError('buildZipSrc is required')

    const buildZipFileName = path.basename(buildZipSrc)
    const buildZip = path.join(constants.HEDERA_USER_HOME_DIR, buildZipFileName) // inside the container
    const extractScriptName = 'extract-jar.sh'
    const extractScriptSrc = path.join(constants.RESOURCES_DIR, extractScriptName)
    const extractScript = path.join(constants.HEDERA_USER_HOME_DIR, extractScriptName) // inside the container

    this.logger.debug(`Extracting platform code in pod ${podName}`, {
      extractScript,
      buildZip,
      dest: constants.HEDERA_HAPI_PATH
    })

    try {
      await this.copyFiles(podName, [extractScriptSrc], constants.HEDERA_USER_HOME_DIR)
      await this.k8.execContainer(podName, constants.ROOT_CONTAINER, `chmod +x ${extractScript}`)
      await this.k8.execContainer(podName, constants.ROOT_CONTAINER, [extractScript, buildZip, constants.HEDERA_HAPI_PATH])

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
          srcFiles.push(`${stagingDir}/keys/${Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, nodeId)}`)
          srcFiles.push(`${stagingDir}/keys/${Templates.renderGossipPemPrivateKeyFile(constants.AGREEMENT_KEY_PREFIX, nodeId)}`)

          // copy all public keys for all nodes
          nodeIds.forEach(id => {
            srcFiles.push(`${stagingDir}/keys/${Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, id)}`)
            srcFiles.push(`${stagingDir}/keys/${Templates.renderGossipPemPublicKeyFile(constants.AGREEMENT_KEY_PREFIX, id)}`)
          })
          break
        case constants.KEY_FORMAT_PFX:
          srcFiles.push(`${stagingDir}/keys/${Templates.renderGossipPfxPrivateKeyFile(nodeId)}`)
          srcFiles.push(`${stagingDir}/keys/public.pfx`)
          break
        default:
          throw new FullstackTestingError(`Unsupported key file format ${keyFormat}`)
      }

      return await self.copyFiles(podName, srcFiles, keysDir)
    } catch (e) {
      throw new FullstackTestingError(`failed to copy gossip keys to pod '${podName}': ${e.message}`, e)
    }
  }

  async copyPlatformConfigFiles (podName, stagingDir) {
    const self = this

    if (!podName) throw new MissingArgumentError('podName is required')
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required')

    try {
      const srcFilesSet1 = [
        `${stagingDir}/config.txt`,
        `${stagingDir}/templates/log4j2.xml`,
        `${stagingDir}/templates/settings.txt`
      ]

      const fileList1 = await self.copyFiles(podName, srcFilesSet1, constants.HEDERA_HAPI_PATH)

      const srcFilesSet2 = [
        `${stagingDir}/templates/api-permission.properties`,
        `${stagingDir}/templates/application.properties`,
        `${stagingDir}/templates/bootstrap.properties`
      ]

      const fileList2 = await self.copyFiles(podName, srcFilesSet2, `${constants.HEDERA_HAPI_PATH}/data/config`)

      return fileList1.concat(fileList2)
    } catch (e) {
      throw new FullstackTestingError(`failed to copy config files to pod '${podName}': ${e.message}`, e)
    }
  }

  async copyTLSKeys (podName, stagingDir) {
    if (!podName) throw new MissingArgumentError('podName is required')
    if (!stagingDir) throw new MissingArgumentError('stagingDir is required')

    try {
      const nodeId = Templates.extractNodeIdFromPodName(podName)
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${nodeId}-tls-keys-`))

      // rename files appropriately in the tmp directory
      fs.cpSync(`${stagingDir}/keys/${Templates.renderTLSPemPrivateKeyFile(nodeId)}`,
        `${tmpDir}/hedera.key`)
      fs.cpSync(`${stagingDir}/keys/${Templates.renderTLSPemPublicKeyFile(nodeId)}`,
        `${tmpDir}/hedera.crt`)

      const srcFiles = []
      srcFiles.push(`${tmpDir}/hedera.key`)
      srcFiles.push(`${tmpDir}/hedera.crt`)

      return this.copyFiles(podName, srcFiles, constants.HEDERA_HAPI_PATH)
    } catch (e) {
      throw new FullstackTestingError(`failed to copy TLS keys to pod '${podName}': ${e.message}`, e)
    }
  }

  async setPathPermission (podName, destPath, mode = '0755', recursive = true, container = constants.ROOT_CONTAINER) {
    if (!podName) throw new MissingArgumentError('podName is required')
    if (!destPath) throw new MissingArgumentError('destPath is required')

    try {
      const recursiveFlag = recursive ? '-R' : ''
      await this.k8.execContainer(podName, container, `chown ${recursiveFlag} hedera:hedera ${destPath}`)
      await this.k8.execContainer(podName, container, `chmod ${recursiveFlag} ${mode} ${destPath}`)
      return true
    } catch (e) {
      throw new FullstackTestingError(`failed to set permission in '${podName}': ${destPath}`, e)
    }
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
   * Prepares config.txt file for the node
   * @param nodeIDs node IDs
   * @param destPath path where config.txt should be written
   * @param releaseTag release tag e.g. v0.42.0
   * @param template path to the confit.template file
   * @param chainId chain ID (298 for local network)
   * @returns {Promise<unknown>}
   */
  async prepareConfigTxt (nodeIDs, destPath, releaseTag, chainId = constants.HEDERA_CHAIN_ID, template = `${constants.RESOURCES_DIR}/templates/config.template`) {
    const self = this

    if (!nodeIDs || nodeIDs.length === 0) throw new MissingArgumentError('list of node IDs is required')
    if (!destPath) throw new MissingArgumentError('destPath is required')
    if (!template) throw new MissingArgumentError('config templatePath is required')
    if (!releaseTag) throw new MissingArgumentError('release tag is required')

    if (!fs.existsSync(path.dirname(destPath))) throw new IllegalArgumentError(`destPath does not exist: ${destPath}`, destPath)
    if (!fs.existsSync(template)) throw new IllegalArgumentError(`config templatePath does not exist: ${template}`, destPath)

    // init variables
    const startAccountId = constants.HEDERA_NODE_ACCOUNT_ID_START
    const accountIdPrefix = `${startAccountId.realm}.${startAccountId.shard}`
    const internalPort = constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT
    const externalPort = constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT
    const appName = constants.HEDERA_APP_NAME
    const nodeStakeAmount = constants.HEDERA_NODE_DEFAULT_STAKE_AMOUNT

    const releaseVersion = helpers.parseSemver(releaseTag)

    try {
      const configLines = []
      configLines.push(`swirld, ${chainId}`)
      configLines.push(`app, ${appName}`)

      let nodeSeq = 0
      let accountIdSeq = parseInt(startAccountId.num.toString(), 10)
      for (const nodeId of nodeIDs) {
        const podName = Templates.renderNetworkPodName(nodeId)
        const svcName = Templates.renderNetworkSvcName(nodeId)

        const nodeName = nodeId
        const nodeNickName = nodeId

        const internalIP = await self.k8.getPodIP(podName)
        const externalIP = await self.k8.getClusterIP(svcName)

        const account = `${accountIdPrefix}.${accountIdSeq}`
        if (releaseVersion.minor >= 40) {
          configLines.push(`address, ${nodeSeq}, ${nodeNickName}, ${nodeName}, ${nodeStakeAmount}, ${internalIP}, ${internalPort}, ${externalIP}, ${externalPort}, ${account}`)
        } else {
          configLines.push(`address, ${nodeSeq}, ${nodeName}, ${nodeStakeAmount}, ${internalIP}, ${internalPort}, ${externalIP}, ${externalPort}, ${account}`)
        }

        nodeSeq += 1
        accountIdSeq += 1
      }

      if (releaseVersion.minor >= 41) {
        configLines.push(`nextNodeId, ${nodeSeq}`)
      }

      fs.writeFileSync(destPath, configLines.join('\n'))

      return configLines
    } catch (e) {
      throw new FullstackTestingError('failed to generate config.txt', e)
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
   *   ${staging}/keys/hedera-<nodeId>.crt: gRPC TSL cert for a node
   *   ${staging}/properties: contains all properties files
   *   ${staging}/log4j2.xml: LOG4J file
   *   ${staging}/settings.txt: settings.txt file for the network
   *   ${staging}/config.txt: config.txt file for the network
   *
   * @param podName name of the pod
   * @param buildZipFile path to the platform build.zip file
   * @param stagingDir staging directory path
   * @param nodeIds list of node ids
   * @param keyFormat key format (pfx or pem)
   * @param force force flag
   * @returns {Listr<ListrContext, ListrPrimaryRendererValue, ListrSecondaryRendererValue>}
   */
  taskInstall (podName, buildZipFile, stagingDir, nodeIds, keyFormat = constants.KEY_FORMAT_PEM, force = false) {
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
        title: 'Copy configuration files',
        task: (_, task) =>
          self.copyPlatformConfigFiles(podName, stagingDir)
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
