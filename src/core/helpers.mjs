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
import fs from 'fs'
import os from 'os'
import path from 'path'
import util from 'util'
import { SoloError } from './errors.mjs'
import * as paths from 'path'
import { fileURLToPath } from 'url'
import * as semver from 'semver'
import { Templates } from './templates.mjs'
import { HEDERA_HAPI_PATH, ROOT_CONTAINER, SOLO_LOGS_DIR } from './constants.mjs'
import { constants } from './index.mjs'
import { FileContentsQuery, FileId, PrivateKey, ServiceEndpoint } from '@hashgraph/sdk'
import { Listr } from 'listr2'
import * as yaml from 'js-yaml'

// cache current directory
const CUR_FILE_DIR = paths.dirname(fileURLToPath(import.meta.url))

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * @param {string} input
 * @returns {NodeAliases}
 */
export function parseNodeAliases (input) {
  return splitFlagInput(input, ',')
}

/**
 * @param {string} input
 * @param {string} separator
 * @returns {string[]}
 */
export function splitFlagInput (input, separator = ',') {
  if (typeof input === 'string') {
    const items = []
    input.split(separator).forEach(s => {
      const item = s.trim()
      if (s) {
        items.push(item)
      }
    })

    return items
  }

  throw new SoloError('input is not a comma separated string')
}

/**
 * @template T
 * @param {T[]} arr - The array to be cloned
 * @returns {T[]} A new array with the same elements as the input array
 */
export function cloneArray (arr) {
  return JSON.parse(JSON.stringify(arr))
}

/**
 * load package.json
 * @returns {*}
 */
export function loadPackageJSON () {
  try {
    const raw = fs.readFileSync(path.join(CUR_FILE_DIR, '..', '..', 'package.json'))
    return JSON.parse(raw.toString())
  } catch (e) {
    throw new SoloError('failed to load package.json', e)
  }
}

/**
 * @returns {string}
 */
export function packageVersion () {
  const packageJson = loadPackageJSON()
  return packageJson.version
}

/**
 * Return the required root image for a platform version
 * @param {string} releaseTag - platform version
 * @returns {string}
 */
export function getRootImageRepository (releaseTag) {
  const releaseVersion = semver.parse(releaseTag, { includePrerelease: true })
  if (releaseVersion.minor < 46) {
    return 'hashgraph/solo-containers/ubi8-init-java17'
  }

  return 'hashgraph/solo-containers/ubi8-init-java21'
}

/**
 * @returns {string}
 */
export function getTmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solo-'))
}

/**
 * @param {string} destDir
 * @param {string} prefix
 * @param {Date} curDate
 * @returns {string}
 */
export function createBackupDir (destDir, prefix = 'backup', curDate = new Date()) {
  const dateDir = util.format('%s%s%s_%s%s%s',
    curDate.getFullYear(),
    curDate.getMonth().toString().padStart(2, '0'),
    curDate.getDate().toString().padStart(2, '0'),
    curDate.getHours().toString().padStart(2, '0'),
    curDate.getMinutes().toString().padStart(2, '0'),
    curDate.getSeconds().toString().padStart(2, '0')
  )

  const backupDir = path.join(destDir, prefix, dateDir)
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  return backupDir
}

/**
 * @param {Map<string, string>} [fileMap]
 * @param {boolean} removeOld
 */
export function makeBackup (fileMap = new Map(), removeOld = true) {
  for (const entry of fileMap) {
    const srcPath = entry[0]
    const destPath = entry[1]
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath)
      if (removeOld) {
        fs.rmSync(srcPath)
      }
    }
  }
}

/**
 * @param {NodeAliases} nodeAliases
 * @param {string} keysDir
 * @param {Date} curDate
 * @param {string} dirPrefix
 * @returns {string}
 */
export function backupOldTlsKeys (nodeAliases, keysDir, curDate = new Date(), dirPrefix = 'tls') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate)

  /** @type {Map<string, string>} */
  const fileMap = new Map()
  for (const nodeAlias of nodeAliases) {
    const srcPath = path.join(keysDir, Templates.renderTLSPemPrivateKeyFile(nodeAlias))
    const destPath = path.join(backupDir, Templates.renderTLSPemPrivateKeyFile(nodeAlias))
    fileMap.set(srcPath, destPath)
  }

  makeBackup(fileMap, true)

  return backupDir
}

/**
 * @param {NodeAliases} nodeAliases
 * @param {string} keysDir
 * @param {Date} curDate
 * @param {string} dirPrefix
 * @returns {string}
 */
export function backupOldPemKeys (nodeAliases, keysDir, curDate = new Date(), dirPrefix = 'gossip-pem') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate)

  /** @type {Map<string, string>} */
  const fileMap = new Map()
  for (const nodeAlias of nodeAliases) {
    const srcPath = path.join(keysDir, Templates.renderGossipPemPrivateKeyFile(nodeAlias)) // TODO review
    const destPath = path.join(backupDir, Templates.renderGossipPemPrivateKeyFile(nodeAlias)) // TODO review
    fileMap.set(srcPath, destPath)
  }

  makeBackup(fileMap, true)

  return backupDir
}

/**
 * @param {string} str
 * @returns {boolean}
 */
export function isNumeric (str) {
  if (typeof str !== 'string') return false // we only process strings!
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

/**
 * Validate a path provided by the user to prevent path traversal attacks
 * @param {string} input - the input provided by the user
 * @returns {string} a validated path
 */
export function validatePath (input) {
  if (input.indexOf('\0') !== -1) {
    throw new SoloError(`access denied for path: ${input}`)
  }
  return input
}

/**
 * Download logs files from all network pods and save to local solo log directory
 *    an instance of core/K8
 * @param {K8} k8 - an instance of core/K8
 * @param {string} namespace - the namespace of the network
 * @returns {Promise<void>} A promise that resolves when the logs are downloaded
 */
export async function getNodeLogs (k8, namespace) {
  k8.logger.debug('getNodeLogs: begin...')
  const pods = await k8.getPodsByLabel(['solo.hedera.com/type=network-node'])

  const timeString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')

  for (const pod of pods) {
    const podName = pod.metadata.name
    const targetDir = path.join(SOLO_LOGS_DIR, namespace, timeString)
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
      const scriptName = 'support-zip.sh'
      const sourcePath = path.join(constants.RESOURCES_DIR, scriptName) // script source path
      await k8.copyTo(podName, ROOT_CONTAINER, sourcePath, `${HEDERA_HAPI_PATH}`)
      await k8.execContainer(podName, ROOT_CONTAINER, `chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`)
      await k8.execContainer(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/${scriptName}`)
      await k8.copyFrom(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/${podName}.zip`, targetDir)
    } catch (e) {
      // not throw error here, so we can continue to finish downloading logs from other pods
      // and also delete namespace in the end
      k8.logger.error(`failed to download logs from pod ${podName}`, e)
    }
    k8.logger.debug('getNodeLogs: ...end')
  }
}

/**
 * Create a map of node aliases to account IDs
 * @param {NodeAliases} nodeAliases
 * @returns {Map<NodeAlias, string>} the map of node IDs to account IDs
 */
export function getNodeAccountMap (nodeAliases) {
  const accountMap = /** @type {Map<string,string>} **/ new Map()
  const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
  const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard
  let accountId = constants.HEDERA_NODE_ACCOUNT_ID_START.num

  nodeAliases.forEach(nodeAlias => {
    const nodeAccount = `${realm}.${shard}.${accountId++}`
    accountMap.set(nodeAlias, nodeAccount)
  })
  return accountMap
}

/**
 * @param {AccountManager} accountManager
 * @param {string} namespace
 * @param {number} fileNum
 * @returns {Promise<string>}
 */
export async function getFileContents (accountManager, namespace, fileNum) {
  await accountManager.loadNodeClient(namespace)
  const client = accountManager._nodeClient
  const fileId = FileId.fromString(`0.0.${fileNum}`)
  const queryFees = new FileContentsQuery().setFileId(fileId)
  return Buffer.from(await queryFees.execute(client)).toString('hex')
}

/**
 * @param {Array} envVarArray
 * @param {string} name
 * @returns {string|null}
 */
export function getEnvValue (envVarArray, name) {
  const kvPair = envVarArray.find(v => v.startsWith(`${name}=`))
  return kvPair ? kvPair.split('=')[1] : null
}

/**
 * @param {string} ipAddress
 * @returns {Uint8Array}
 */
export function parseIpAddressToUint8Array (ipAddress) {
  const parts = ipAddress.split('.')
  const uint8Array = new Uint8Array(4)

  for (let i = 0; i < 4; i++) {
    uint8Array[i] = parseInt(parts[i], 10)
  }

  return uint8Array
}

/**
 * If the basename of the src did not match expected basename, rename it first, then copy to destination
 * @param srcFilePath
 * @param expectedBaseName
 * @param destDir
 */
export function renameAndCopyFile (srcFilePath, expectedBaseName, destDir) {
  const srcDir = path.dirname(srcFilePath)
  if (path.basename(srcFilePath) !== expectedBaseName) {
    fs.renameSync(srcFilePath, path.join(srcDir, expectedBaseName))
  }
  // copy public key and private key to key directory
  fs.copyFile(path.join(srcDir, expectedBaseName), path.join(destDir, expectedBaseName), (err) => {
    if (err) {
      self.logger.error(`Error copying file: ${err.message}`)
      throw new SoloError(`Error copying file: ${err.message}`)
    }
  })
}

/**
 * Add debug options to valuesArg used by helm chart
 * @param valuesArg the valuesArg to update
 * @param {NodeAlias} debugNodeAlias the node ID to attach the debugger to
 * @param index the index of extraEnv to add the debug options to
 * @returns updated valuesArg
 */
export function addDebugOptions (valuesArg, debugNodeAlias, index = 0) {
  if (debugNodeAlias) {
    const nodeId = Templates.nodeIdFromNodeAlias(debugNodeAlias) - 1
    valuesArg += ` --set "hedera.nodes[${nodeId}].root.extraEnv[${index}].name=JAVA_OPTS"`
    valuesArg += ` --set "hedera.nodes[${nodeId}].root.extraEnv[${index}].value=-agentlib:jdwp=transport=dt_socket\\,server=y\\,suspend=y\\,address=*:${constants.JVM_DEBUG_PORT}"`
  }
  return valuesArg
}

/**
 * Returns an object that can be written to a file without data loss.
 * Contains fields needed for adding a new node through separate commands
 * @param ctx
 * @returns file writable object
 */
export function addSaveContextParser (ctx) {
  const exportedCtx = {}

  const config = /** @type {NodeAddConfigClass} **/ ctx.config
  const exportedFields = [
    'tlsCertHash',
    'upgradeZipHash',
    'newNode'
  ]

  exportedCtx.signingCertDer = ctx.signingCertDer.toString()
  exportedCtx.gossipEndpoints = ctx.gossipEndpoints.map(ep => `${ep.getDomainName}:${ep.getPort}`)
  exportedCtx.grpcServiceEndpoints = ctx.grpcServiceEndpoints.map(ep => `${ep.getDomainName}:${ep.getPort}`)
  exportedCtx.adminKey = ctx.adminKey.toString()
  exportedCtx.existingNodeAliases = config.existingNodeAliases

  for (const prop of exportedFields) {
    exportedCtx[prop] = ctx[prop]
  }
  return exportedCtx
}

/**
 * Initializes objects in the context from a provided string
 * Contains fields needed for adding a new node through separate commands
 * @param ctx - accumulator object
 * @param ctxData - data in string format
 * @returns file writable object
 */
export function addLoadContextParser (ctx, ctxData) {
  const config = /** @type {NodeAddConfigClass} **/ ctx.config
  ctx.signingCertDer = new Uint8Array(ctxData.signingCertDer.split(','))
  ctx.gossipEndpoints = prepareEndpoints(ctx.config.endpointType, ctxData.gossipEndpoints, constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT)
  ctx.grpcServiceEndpoints = prepareEndpoints(ctx.config.endpointType, ctxData.grpcServiceEndpoints, constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT)
  ctx.adminKey = PrivateKey.fromStringED25519(ctxData.adminKey)
  config.nodeAlias = ctxData.newNode.name
  config.existingNodeAliases = ctxData.existingNodeAliases
  config.allNodeAliases = [...config.existingNodeAliases, ctxData.newNode.name]

  const fieldsToImport = [
    'tlsCertHash',
    'upgradeZipHash',
    'newNode'
  ]

  for (const prop of fieldsToImport) {
    ctx[prop] = ctxData[prop]
  }
}

/**
 * Returns an object that can be written to a file without data loss.
 * Contains fields needed for deleting a node through separate commands
 * @param ctx - accumulator object
 * @returns file writable object
 */
export function deleteSaveContextParser (ctx) {
  const exportedCtx = {}

  const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
  exportedCtx.adminKey = config.adminKey.toString()
  exportedCtx.existingNodeAliases = config.existingNodeAliases
  exportedCtx.upgradeZipHash = ctx.upgradeZipHash
  exportedCtx.nodeAlias = config.nodeAlias
  return exportedCtx
}

/**
 * Initializes objects in the context from a provided string
 * Contains fields needed for deleting a node through separate commands
 * @param ctx - accumulator object
 * @param ctxData - data in string format
 * @returns file writable object
 */
export function deleteLoadContextParser (ctx, ctxData) {
  const config = /** @type {NodeDeleteConfigClass} **/ ctx.config
  config.adminKey = PrivateKey.fromStringED25519(ctxData.adminKey)
  config.existingNodeAliases = ctxData.existingNodeAliases
  config.allNodeAliases = ctxData.existingNodeAliases
  ctx.upgradeZipHash = ctxData.upgradeZipHash
  config.podNames = {}
}

/**
 * @param {string} endpointType
 * @param {string[]} endpoints
 * @param {number} defaultPort
 * @returns {ServiceEndpoint[]}
 */
export function prepareEndpoints (endpointType, endpoints, defaultPort) {
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
      throw new SoloError(`incorrect endpoint format. expected url:port, found ${endpoint}`)
    }

    if (endpointType.toUpperCase() === constants.ENDPOINT_TYPE_IP) {
      ret.push(new ServiceEndpoint({
        port,
        ipAddressV4: parseIpAddressToUint8Array(url)
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

export function commandActionBuilder (actionTasks, options, errorString = 'Error') {
  /**
   * @param {Object} argv
   * @param {BaseCommand} commandDef
   * @returns {Promise<boolean>}
   */
  return async function (argv, commandDef) {
    const tasks = new Listr([
      ...actionTasks
    ], options)

    try {
      await tasks.run()
    } catch (e) {
      commandDef.logger.error(`${errorString}: ${e.message}`, e)
      throw new SoloError(`${errorString}: ${e.message}`, e)
    } finally {
      await commandDef.close()
    }
  }
}

/**
 * Adds all the types of flags as properties on the provided argv object
 * @param argv
 * @param flags
 * @returns {*}
 */
export function addFlagsToArgv (argv, flags) {
  argv.requiredFlags = flags.requiredFlags
  argv.requiredFlagsWithDisabledPrompt = flags.requiredFlagsWithDisabledPrompt
  argv.optionalFlags = flags.optionalFlags

  return argv
}
/**
 * Convert yaml file to object
 * @param yamlFile
 */
export function yamlToObject (yamlFile) {
  try {
    if (fs.existsSync(yamlFile)) {
      const yamlData = fs.readFileSync(yamlFile, 'utf8')
      const configItems = yaml.load(yamlData)
      const configMap = {}
      for (const key in configItems) {
        let config = configItems[key]
        config = config || {}
        configMap[key] = config
      }
      return configMap
    }
  } catch (e) {
    throw new SoloError(`failed to convert yaml file ${yamlFile} to object: ${e.message}`, e)
  }
}
