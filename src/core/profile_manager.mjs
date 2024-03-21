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

const resourceRequestTypes = ['requests', 'limits']
const hardwareTypes = ['cpu', 'memory']
const consensusSidecars = [
  'recordStreamUploader', 'eventStreamUploader', 'backupUploader', 'accountBalanceUploader', 'otelCollector']

export class ProfileManager {
  /**
   * Constructor
   * @param logger an instance of core/Logger
   * @param configManager an instance of core/ConfigManager
   * @param profileCacheDir cache directory where the values file will be written. A yaml file named <profileName>.yaml is created.
   */
  constructor (logger, configManager, profileCacheDir = path.join(constants.SOLO_CACHE_DIR, 'profiles')) {
    if (!logger) throw new MissingArgumentError('An instance of core/Logger is required')
    if (!configManager) throw new MissingArgumentError('An instance of core/ConfigManager is required')

    this.logger = logger
    this.configManager = configManager
    this.profiles = new Map()

    profileCacheDir = path.resolve(profileCacheDir)
    if (!fs.existsSync(profileCacheDir)) {
      fs.mkdirSync(profileCacheDir)
    }
    this.profileCacheDir = profileCacheDir
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
      const profile = profileItems[key]
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
   * Set resources for the chart
   * @param itemPath item path in the yaml
   * @param itemResources item resources object
   * @param yamlRoot root of the yaml object
   * @private
   */
  _setChartResources (itemPath, itemResources, yamlRoot) {
    if (!itemResources || !itemResources.resources) return

    for (const resourceRequestType of resourceRequestTypes) {
      if (itemResources && itemResources.resources[resourceRequestType]) {
        const resources = itemResources.resources[resourceRequestType]
        for (const hardware of hardwareTypes) {
          if (resources[hardware] !== undefined) {
            if (itemPath) {
              this._setValue(`${itemPath}.resources.${resourceRequestType}.${hardware}`, resources[hardware], yamlRoot)
            } else {
              this._setValue(`resources.${resourceRequestType}.${hardware}`, resources[hardware], yamlRoot)
            }
          }
        }
      }
    }
  }

  resourcesForConsensusPod (profile, nodeIds, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.consensus) return // use chart defaults

    // prepare name and account IDs for nodes
    const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
    const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard
    let accountId = constants.HEDERA_NODE_ACCOUNT_ID_START.num

    // set consensus pod level resources
    for (let nodeIndex = 0; nodeIndex < nodeIds.length; nodeIndex++) {
      this._setValue(`hedera.nodes.${nodeIndex}.name`, nodeIds[nodeIndex], yamlRoot)
      this._setValue(`hedera.nodes.${nodeIndex}.accountId`, `${realm}.${shard}.${accountId++}`, yamlRoot)
      this._setChartResources(`hedera.nodes.${nodeIndex}`, profile.consensus, yamlRoot)
    }

    // set default for consensus pod
    this._setChartResources('defaults.root', profile.consensus.root, yamlRoot)

    // set sidecar resources
    for (const sidecar of consensusSidecars) {
      this._setChartResources(`defaults.sidecars.${sidecar}`, profile.consensus[sidecar], yamlRoot)
    }

    return yamlRoot
  }

  resourcesForHAProxyPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.haproxy) return // use chart defaults

    return this._setChartResources('defaults.haproxy', profile.haproxy, yamlRoot)
  }

  resourcesForEnvoyProxyPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.envoyProxy) return // use chart defaults
    return this._setChartResources('defaults.envoyProxy', profile.envoyProxy, yamlRoot)
  }

  resourcesForHederaExplorerPod (profile, yamlRoot) {
    if (!profile) throw new MissingArgumentError('profile is required')
    if (!profile.explorer) return
    return this._setChartResources('hedera-explorer', profile.explorer, yamlRoot)
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

      this._setChartResources(`minio-server.tenant.pools.${poolIndex}`, pool, yamlRoot)
    }

    return yamlRoot
  }

  /**
   * Prepare a values file for FST Helm chart
   * @param profileName resource profile name
   * @return {Promise<string>} return the full path to the values file
   */
  prepareValuesForFSTChart (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')
    const profile = this.getProfile(profileName)
    if (!profile.consensus) return Promise.resolve()// use chart defaults

    const nodeIds = helpers.parseNodeIDs(this.configManager.getFlag(flags.nodeIDs))
    if (!nodeIds) throw new FullstackTestingError('Node IDs are not set in the config')

    // generate the yaml
    const yamlRoot = {}
    this.resourcesForConsensusPod(profile, nodeIds, yamlRoot)
    this.resourcesForHAProxyPod(profile, yamlRoot)
    this.resourcesForEnvoyProxyPod(profile, yamlRoot)
    this.resourcesForMinioTenantPod(profile, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.profileCacheDir, `fst-${profileName}.yaml`)
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
    this._setChartResources('', profile.rpcRelay, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.profileCacheDir, `rpcRelay-${profileName}.yaml`)
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
    this._setChartResources('hedera-mirror-node.postgresql', profile.mirror.postgresql, yamlRoot)
    this._setChartResources('hedera-mirror-node.importer', profile.mirror.importer, yamlRoot)
    this._setChartResources('hedera-mirror-node.rest', profile.mirror.rest, yamlRoot)
    this._setChartResources('hedera-mirror-node.web3', profile.mirror.web3, yamlRoot)
    this._setChartResources('hedera-mirror-node.grpc', profile.mirror.grpc, yamlRoot)
    this._setChartResources('hedera-mirror-node.monitor', profile.mirror.monitor, yamlRoot)
    this.resourcesForHederaExplorerPod(profile, yamlRoot)

    // write the yaml
    const cachedValuesFile = path.join(this.profileCacheDir, `mirror-${profileName}.yaml`)
    return new Promise((resolve, reject) => {
      fs.writeFile(cachedValuesFile, yaml.dump(yamlRoot), (err) => {
        if (err) {
          reject(err)
        }

        resolve(cachedValuesFile)
      })
    })
  }
}
