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
import { FullstackTestingError, IllegalArgumentError, MissingArgumentError } from './errors.mjs'
import * as yaml from 'js-yaml'
import { flags } from '../commands/index.mjs'
import { helpers } from './index.mjs'

const resourceRequestTypes = ['requests', 'limits']
const hardwareTypes = ['cpu', 'memory']
const consensusSidecars = [
  'recordStreamUploader', 'eventStreamUploader', 'backupUploader', 'accountBalanceUploader', 'otelCollector']

export class ProfileManager {
  constructor (logger, configManager) {
    if (!logger) throw new MissingArgumentError('An instance of core/Logger is required')
    if (!configManager) throw new MissingArgumentError('An instance of core/ConfigManager is required')

    this.logger = logger
    this.configManager = configManager
    this.profiles = new Map()
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

  _prepareChartValues (itemPath, itemResources) {
    let valuesArg = ''
    for (const resourceRequestType of resourceRequestTypes) {
      if (itemResources && itemResources[resourceRequestType]) {
        const resources = itemResources[resourceRequestType]
        for (const hardware of hardwareTypes) {
          if (resources[hardware]) {
            valuesArg += ` --set "${itemPath}.resources.${resourceRequestType}.${hardware}=${resources[hardware]}"`
          }
        }
      }
    }

    return valuesArg
  }

  resourceValuesForConsensus (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')

    let valuesArg = ''
    const profile = this.getProfile(profileName)
    if (!profile.consensus) throw new MissingArgumentError('Consensus node resources profile is required')

    // set root container resources
    valuesArg += this._prepareChartValues(`defaults.root`, profile.consensus.containers.root)

    // set sidecar resources
    for (const sidecar of consensusSidecars) {
      valuesArg += this._prepareChartValues(
        `defaults.sidecars.${sidecar}`, profile.consensus.containers[sidecar])
    }

    return valuesArg
  }

  resourceValuesForHAProxy (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')

    const profile = this.getProfile(profileName)
    if (!profile.haproxy) throw new MissingArgumentError('haproxy resource profile is required')

    return this._prepareChartValues(`defaults.haproxy`, profile.haproxy)
  }

  resourceValuesForEnvoyProxy (profileName) {
    if (!profileName) throw new MissingArgumentError('profileName is required')

    const profile = this.getProfile(profileName)
    if (!profile.envoyProxy) throw new MissingArgumentError('envoyProxy resource profile is required')

    return this._prepareChartValues(`defaults.envoyProxy`, profile.envoyProxy)
  }

  resourceValuesForMinioTenant (profileName) {
    let valuesArg = ''

    const profile = this.getProfile(profileName)
    if (!profile.minio || !profile.minio.tenant) throw new MissingArgumentError('minio.tenant resource profile is required')

    valuesArg += this._prepareChartValues('minio-server.tenant.pools[0]', profile.minio.tenant)
    valuesArg += ` --set "minio-server.tenant.pools[0].size=${profile.minio.tenant.size}"`

    return valuesArg
  }

  resourceValuesForRpcRelayChart (profileName) {
    const profile = this.getProfile(profileName)
    if (!profile.rpcRelay) throw new MissingArgumentError('rpcRelay resource profile is required')

    return this._prepareChartValues('', profile.rpcRelay)
  }

  resourceValuesForFSTChart (profileName) {
    const nodeIds = helpers.parseNodeIDs(this.configManager.getFlag(flags.nodeIDs))
    if (!nodeIds) throw new FullstackTestingError('Node IDs are not set in the config')

    let valuesArg = ''
    const profile = this.getProfile(profileName)
    for (let nodeIndex = 0; nodeIndex < nodeIds.length; nodeIndex++) {
      valuesArg += this._prepareChartValues(`hedera.nodes[${nodeIndex}]`, profile.consensus)
    }
    valuesArg += this.resourceValuesForConsensus(profileName)
    valuesArg += this.resourceValuesForHAProxy(profileName)
    valuesArg += this.resourceValuesForEnvoyProxy(profileName)
    valuesArg += this.resourceValuesForMinioTenant(profileName)

    return valuesArg
  }

  resourceValuesForMirrorNodeChart (profileName) {
    let valuesArg = ''

    const profile = this.getProfile(profileName)
    if (!profile.mirror) throw new MissingArgumentError('mirror resource profile is required')

    valuesArg += this._prepareChartValues('hedera-mirror-node.postgresql', profile.mirror.postgresql)
    valuesArg += this._prepareChartValues('hedera-mirror-node.importer', profile.mirror.importer)
    valuesArg += this._prepareChartValues('hedera-mirror-node.rest', profile.mirror.rest)
    valuesArg += this._prepareChartValues('hedera-mirror-node.web3', profile.mirror.web3)
    valuesArg += this._prepareChartValues('hedera-mirror-node.grpc', profile.mirror.grpc)
    valuesArg += this._prepareChartValues('hedera-mirror-node.monitor', profile.mirror.monitor)

    return valuesArg
  }
}
