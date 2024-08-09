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
import fs from 'fs'
import path from 'path'
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from './errors.mjs'
import * as yaml from 'js-yaml'
import { flags } from '../commands/index.mjs'
import { constants, helpers } from './index.mjs'
import dot from 'dot-object'
import { getNodeAccountMap } from './helpers.mjs'

const consensusSidecars = [
  'recordStreamUploader', 'eventStreamUploader', 'backupUploader', 'accountBalanceUploader', 'otelCollector']

export class ProfileManager {
  /**
   * Constructor
   * @param logger an instance of core/Logger
   * @param configManager an instance of core/ConfigManager
   * @param cacheDir cache directory where the values file will be written. A yaml file named <profileName>.yaml is created.
   */
  constructor (logger, configManager, cacheDir = constants.SOLO_VALUES_DIR) {
    if (!logger) throw new MissingArgumentError('An instance of core/Logger is required')
    if (!configManager) throw new MissingArgumentError('An instance of core/ConfigManager is required')

    this.logger = logger
    this.configManager = configManager
    this.profiles = new Map()

    cacheDir = path.resolve(cacheDir)
    this.cacheDir = cacheDir
  }

  loadProfiles (forceReload = false) {
    const profileFile = this.configManager.getFlag(flags.profileFile)
    if (!profileFile) throw new MissingArgumentError('profileFile is required')

    // return the cached value as quickly as possible
    if (this.profiles && this.profileFile === profileFile && !forceReload) {
      return this.profiles
    }

    if (!fs.existsSync(profileFile)) throw new IllegalArgumentError(`profileFile does not exist: ${profileFile}`)

    // load profile file
    this.profiles = new Map()
    const yamlData = fs.readFileSync(profileFile, 'utf8')
    const profileItems = yaml.load(yamlData)

    // add profiles
    for (const key in profileItems) {
      let profile = profileItems[key]
      profile = profile || {}
      this.profiles.set(key, profile)
    }

    this.profileFile = profileFile
    return this.profiles
  }

  getProfile (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    if (!this.profiles || this.profiles.size <= 0) {
      this.loadProfiles()
    }

    if (!this.profiles || !this.profiles.has(profileName)) throw new IllegalArgumentError(`Profile does not exists with name: ${profileName}`)
    return this.profiles.get(profileName)
  }

  /**
   * Set value in the yaml object
   * @param itemPath item path in the yaml
   * @param value value to be set
   * @param yamlRoot root of the yaml object
   * @return {*}
   * @private
   */
  _setValue (itemPath, value, yamlRoot) {
    // find the location where to set the value in the yaml
    const itemPathParts = itemPath.split('.')
    let parent = yamlRoot
    let current = parent
    let prevItemPath = ''
    for (let itemPathPart of itemPathParts) {
      if (helpers.isNumeric(itemPathPart)) {
        itemPathPart = Number.parseInt(itemPathPart) // numeric path part can only be array index i.e. an integer
        if (!Array.isArray(parent[prevItemPath])) {
          parent[prevItemPath] = []
        }

        if (!parent[prevItemPath][itemPathPart]) {
          parent[prevItemPath][itemPathPart] = {}
        }

        parent = parent[prevItemPath]
        prevItemPath = itemPathPart
        current = parent[itemPathPart]
      } else {
        if (!current[itemPathPart]) {
          current[itemPathPart] = {}
        }

        parent = current
        prevItemPath = itemPathPart
        current = parent[itemPathPart]
      }
    }

    parent[prevItemPath] = value
    return yamlRoot
  }

  /**
   * Set items for the chart
   * @param itemPath item path in the yaml, if empty then root of the yaml object will be used
   * @param items the element object
   * @param yamlRoot root of the yaml object to update
   * @private
   */
  _setChartItems (itemPath, items, yamlRoot) {
    if (!items) return

    const dotItems = dot.dot(items)

    for (const key in dotItems) {
      if (itemPath) {
        this._setValue(`${itemPath}.${key}`, dotItems[key], yamlRoot)
      } else {
        this._setValue(key, dotItems[key], yamlRoot)
      }
    }
  }

  resourcesForConsensusPod (profile, nodeIds, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')

    const accountMap = getNodeAccountMap(nodeIds)

    // set consensus pod level resources
    for (let nodeIndex = 0; nodeIndex < nodeIds.length; nodeIndex++) {
      this._setValue(`hedera.nodes.${nodeIndex}.name`, nodeIds[nodeIndex], yamlRoot)
      this._setValue(`hedera.nodes.${nodeIndex}.accountId`, accountMap.get(nodeIds[nodeIndex]), yamlRoot)
      this._setChartItems(`hedera.nodes.${nodeIndex}`, profile.consensus, yamlRoot)
      // if (nodeIndex === 0) {
      //   this._setValue(`hedera.nodes.${nodeIndex}.root.extraEnv.0.name`, 'JAVA_OPTS', yamlRoot)
      //   this._setValue(`hedera.nodes.${nodeIndex}.root.extraEnv.0.value`, '-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005', yamlRoot)
      // }
    }

    if (profile.consensus) {
      // set default for consensus pod
      this._setChartItems('defaults.root', profile.consensus.root, yamlRoot)

      // set sidecar resources
      for (const sidecar of consensusSidecars) {
        this._setChartItems(`defaults.sidecars.${sidecar}`, profile.consensus[sidecar], yamlRoot)
      }
    }

    return yamlRoot
  }

  resourcesForHaProxyPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.haproxy) return // use chart defaults

    return this._setChartItems('defaults.haproxy', profile.haproxy, yamlRoot)
  }

  resourcesForEnvoyProxyPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.envoyProxy) return // use chart defaults
    return this._setChartItems('defaults.envoyProxy', profile.envoyProxy, yamlRoot)
  }

  resourcesForHederaExplorerPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.explorer) return
    return this._setChartItems('hedera-explorer', profile.explorer, yamlRoot)
  }

  resourcesForMinioTenantPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.minio || !profile.minio.tenant) return // use chart defaults

    for (const poolIndex in profile.minio.tenant.pools) {
      const pool = profile.minio.tenant.pools[poolIndex]
      for (const prop in pool) {
        if (prop !== 'resources') {
          this._setValue(`minio-server.tenant.pools.${poolIndex}.${prop}`, pool[prop], yamlRoot)
        }
      }

      this._setChartItems(`minio-server.tenant.pools.${poolIndex}`, pool, yamlRoot)
    }

    return yamlRoot
  }

  /**
   * Prepare a values file for FST Helm chart
   * @param {string} profileName resource profile name
   * @param {string} applicationEnvFilePath path to the application.env file
   * @return {Promise<string>} return the full path to the values file
   */
  prepareValuesForFstChart (profileName, applicationEnvFilePath = '') {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    const profile = this.getProfile(profileName)

    const nodeIds = helpers.parseNodeIds(this.configManager.getFlag(flags.nodeIDs))
    if (!nodeIds) throw new FullstackTestingError('Node IDs are not set in the config')

    // generate the yaml
    const yamlRoot = {}
    this.resourcesForConsensusPod(profile, nodeIds, yamlRoot)
    this.resourcesForHaProxyPod(profile, yamlRoot)
    this.resourcesForEnvoyProxyPod(profile, yamlRoot)
    this.resourcesForMinioTenantPod(profile, yamlRoot)

    if (applicationEnvFilePath) {
      this._setFileContentsAsValue('hedera.configMaps.applicationEnv', applicationEnvFilePath, yamlRoot)
    }

    // write the yaml
    const cachedValuesFile = path.join(this.cacheDir, `fst-${profileName}.yaml`)
    return new Promise((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.dump(yamlRoot), (err) => {
        if (err) {
          reject(err)
        }

        resolve(cachedValuesFile)
      })
    })
  }

  /**
   * Prepare a values file for rpc-relay Helm chart
   * @param profileName resource profile name
   * @return {Promise<string>} return the full path to the values file
   */
  prepareValuesForRpcRelayChart (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    const profile = this.getProfile(profileName)
    if (!profile.rpcRelay) return Promise.resolve()// use chart defaults

    // generate the yaml
    const yamlRoot = {}
    this._setChartItems('', profile.rpcRelay, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.cacheDir, `rpcRelay-${profileName}.yaml`)
    return new Promise((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.dump(yamlRoot), (err) => {
        if (err) {
          reject(err)
        }

        resolve(cachedValuesFile)
      })
    })
  }

  /**
   * Prepare a values file for mirror-node Helm chart
   * @param profileName resource profile name
   * @return {Promise<string>} return the full path to the values file
   */
  prepareValuesForMirrorNodeChart (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    const profile = this.getProfile(profileName)
    if (!profile.mirror) return Promise.resolve() // use chart defaults

    // generate the yaml
    const yamlRoot = {}
    if (profile.mirror.postgresql) {
      if (profile.mirror.postgresql.persistence) {
        this._setValue('hedera-mirror-node.postgresql.persistence.size', profile.mirror.postgresql.persistence.size, yamlRoot)
      }

      this._setChartItems('hedera-mirror-node.postgresql.postgresql', profile.mirror.postgresql.postgresql, yamlRoot)
    }

    this._setChartItems('hedera-mirror-node.importer', profile.mirror.importer, yamlRoot)
    this._setChartItems('hedera-mirror-node.rest', profile.mirror.rest, yamlRoot)
    this._setChartItems('hedera-mirror-node.web3', profile.mirror.web3, yamlRoot)
    this._setChartItems('hedera-mirror-node.grpc', profile.mirror.grpc, yamlRoot)
    this._setChartItems('hedera-mirror-node.monitor', profile.mirror.monitor, yamlRoot)
    this.resourcesForHederaExplorerPod(profile, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.cacheDir, `mirror-${profileName}.yaml`)
    return new Promise((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.dump(yamlRoot), (err) => {
        if (err) {
          reject(err)
        }

        resolve(cachedValuesFile)
      })
    })
  }

  /**
   * Writes the contents of a file as a value for the given nested item path in the yaml object
   * @param {string} itemPath nested item path in the yaml object to store the file contents
   * @param {string} valueFilePath path to the file whose contents will be stored in the yaml object
   * @param {Object} yamlRoot root of the yaml object
   * @private
   */
  _setFileContentsAsValue (itemPath, valueFilePath, yamlRoot) {
    const fileContents = fs.readFileSync(valueFilePath, 'utf8')
    this._setValue(itemPath, fileContents, yamlRoot)
  }
}
