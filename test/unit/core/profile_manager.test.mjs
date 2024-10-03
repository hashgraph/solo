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
import * as yaml from 'js-yaml'
import path from 'path'
import { flags } from '../../../src/commands/index.mjs'
import {
  ConfigManager,
  constants,
  ProfileManager
} from '../../../src/core/index.mjs'
import { getTestCacheDir, getTmpDir, testLogger } from '../../test_util.js'
import * as version from '../../../version.mjs'

const tmpDir = getTmpDir()
const configFile = path.join(tmpDir, 'resource-manager.config')
const configManager = new ConfigManager(testLogger, configFile)
const profileManager = new ProfileManager(testLogger, configManager, tmpDir)
configManager.setFlag(flags.nodeIDs, 'node1,node2,node4')
const testProfileFile = path.join('test', 'data', 'test-profiles.yaml')
configManager.setFlag(flags.cacheDir, getTestCacheDir('ProfileManager'))
configManager.setFlag(flags.releaseTag, version.HEDERA_PLATFORM_VERSION)
const cacheDir = configManager.getFlag(flags.cacheDir)
configManager.setFlag(flags.apiPermissionProperties, path.join(cacheDir, 'templates', 'api-permission.properties'))
configManager.setFlag(flags.applicationProperties, path.join(cacheDir, 'templates', 'application.properties'))
configManager.setFlag(flags.bootstrapProperties, path.join(cacheDir, 'templates', 'bootstrap.properties'))
configManager.setFlag(flags.log4j2Xml, path.join(cacheDir, 'templates', 'log4j2.xml'))
configManager.setFlag(flags.settingTxt, path.join(cacheDir, 'templates', 'settings.txt'))

describe('ProfileManager', () => {
  after(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('should throw error for missing profile file', () => {
    try {
      configManager.setFlag(flags.profileFile, 'INVALID')
      profileManager.loadProfiles(true)
      throw new Error()
    } catch (e) {
      expect(e.message).to.include('profileFile does not exist')
    }
  })

  it('should be able to load a profile file', () => {
    configManager.setFlag(flags.profileFile, testProfileFile)
    const profiles = profileManager.loadProfiles(true)
    expect(profiles).not.to.be.null
    for (const entry of profiles) {
      const profile = entry[1]
      expect(profile).not.to.be.null
      for (const component of ['consensus', 'rpcRelay', 'haproxy', 'envoyProxy', 'explorer', 'mirror', 'minio']) {
        expect(profile[component]).not.to.be.undefined
      }
    }
  })

  describe.each([
    { profileName: 'test', profileFile: testProfileFile }
  ])('determine chart values for a profile', (input) => {
    it(`should determine FST chart values [profile = ${input.profileName}]`, async () => {
      configManager.setFlag(flags.profileFile, input.profileFile)

      const resources = ['templates', 'profiles']
      for (const dirName of resources) {
        const srcDir = path.resolve(path.join(constants.RESOURCES_DIR, dirName))
        if (!fs.existsSync(srcDir)) continue

        const destDir = path.resolve(path.join(cacheDir, dirName))
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }

        fs.cpSync(srcDir, destDir, { recursive: true })
      }

      profileManager.loadProfiles(true)
      const valuesFile = await profileManager.prepareValuesForFstChart(input.profileName)
      expect(valuesFile).not.to.be.null
      expect(fs.existsSync(valuesFile)).to.be.ok

      // validate the yaml
      const valuesYaml = yaml.load(fs.readFileSync(valuesFile).toString())
      expect(valuesYaml.hedera.nodes.length).to.equal(3)
      expect(valuesYaml.defaults.root.resources.limits.cpu).not.to.be.null
      expect(valuesYaml.defaults.root.resources.limits.memory).not.to.be.null

      // check all sidecars have resources
      for (const component of
        ['recordStreamUploader', 'eventStreamUploader', 'backupUploader', 'accountBalanceUploader', 'otelCollector']) {
        expect(valuesYaml.defaults.sidecars[component].resources.limits.cpu).not.to.be.null
        expect(valuesYaml.defaults.sidecars[component].resources.limits.memory).not.to.be.null
      }

      // check proxies have resources
      for (const component of ['haproxy', 'envoyProxy']) {
        expect(valuesYaml.defaults[component].resources.limits.cpu).not.to.be.null
        expect(valuesYaml.defaults[component].resources.limits.memory).not.to.be.null
      }

      // check minio-tenant has resources
      expect(valuesYaml['minio-server'].tenant.pools[0].resources.limits.cpu).not.to.be.null
      expect(valuesYaml['minio-server'].tenant.pools[0].resources.limits.memory).not.to.be.null
    })

    it(`should determine mirror-node chart values [profile = ${input.profileName}]`, async () => {
      configManager.setFlag(flags.profileFile, input.profileFile)
      configManager.setFlag(flags.cacheDir, getTestCacheDir('ProfileManager'))
      configManager.setFlag(flags.releaseTag, version.HEDERA_PLATFORM_VERSION)
      profileManager.loadProfiles(true)
      const valuesFile = await profileManager.prepareValuesForMirrorNodeChart(input.profileName)
      expect(fs.existsSync(valuesFile)).to.be.ok

      // validate yaml
      const valuesYaml = yaml.load(fs.readFileSync(valuesFile).toString())
      expect(valuesYaml['hedera-mirror-node'].postgresql.persistence.size).not.to.be.null
      expect(valuesYaml['hedera-mirror-node'].postgresql.postgresql.resources.limits.cpu).not.to.be.null
      expect(valuesYaml['hedera-mirror-node'].postgresql.postgresql.resources.limits.memory).not.to.be.null
      for (const component of ['grpc', 'rest', 'web3', 'importer']) {
        expect(valuesYaml['hedera-mirror-node'][component].resources.limits.cpu).not.to.be.null
        expect(valuesYaml['hedera-mirror-node'][component].resources.limits.memory).not.to.be.null
        expect(valuesYaml['hedera-mirror-node'][component].readinessProbe.failureThreshold).to.equal(60)
        expect(valuesYaml['hedera-mirror-node'][component].livenessProbe.failureThreshold).to.equal(60)
      }
      expect(valuesYaml['hedera-explorer'].resources.limits.cpu).not.to.be.null
      expect(valuesYaml['hedera-explorer'].resources.limits.memory).not.to.be.null
    })

    it(`should determine rpc-relay chart values [profile = ${input.profileName}]`, async () => {
      configManager.setFlag(flags.profileFile, input.profileFile)
      profileManager.loadProfiles(true)
      const valuesFile = await profileManager.prepareValuesForRpcRelayChart(input.profileName)
      expect(fs.existsSync(valuesFile)).to.be.ok
      // validate yaml
      const valuesYaml = yaml.load(fs.readFileSync(valuesFile).toString())
      expect(valuesYaml.resources.limits.cpu).not.to.be.null
      expect(valuesYaml.resources.limits.memory).not.to.be.null
    })
  })

  it('prepareValuesForFstChart should set the value of a key to the contents of a file', async () => {
    configManager.setFlag(flags.profileFile, testProfileFile)

    // profileManager.loadProfiles(true)
    const file = path.join(tmpDir, '_setFileContentsAsValue.txt')
    const fileContents = '# row 1\n# row 2\n# row 3'
    fs.writeFileSync(file, fileContents)
    configManager.setFlag(flags.applicationEnv, file)
    const cachedValuesFile = await profileManager.prepareValuesForFstChart('test')
    const valuesYaml = yaml.load(fs.readFileSync(cachedValuesFile).toString())
    expect(valuesYaml.hedera.configMaps.applicationEnv).to.equal(fileContents)
  })

  describe('prepareConfigText', () => {
    it('should write and return the path to the config.txt file', () => {
      const nodeAccountMap = /** @type {Map<string, string>} */ new Map()
      nodeAccountMap.set('node1', '0.0.3')
      nodeAccountMap.set('node2', '0.0.4')
      nodeAccountMap.set('node3', '0.0.5')
      const destPath = path.join(tmpDir, 'staging')
      fs.mkdirSync(destPath, { recursive: true })
      const namespace = 'test-namespace'
      profileManager.prepareConfigTxt(namespace, nodeAccountMap, destPath, version.HEDERA_PLATFORM_VERSION)

      // expect that the config.txt file was created and exists
      const configFile = path.join(destPath, 'config.txt')
      expect(fs.existsSync(configFile)).to.be.ok

      const configText = fs.readFileSync(configFile).toString()

      // expect that the config.txt file contains the namespace
      expect(configText.includes(namespace)).to.be.ok
      // expect that the config.txt file contains the node account IDs
      expect(configText.includes('0.0.3')).to.be.ok
      expect(configText.includes('0.0.4')).to.be.ok
      expect(configText.includes('0.0.5')).to.be.ok
      // expect the config.txt file to contain the node IDs
      expect(configText.includes('node1')).to.be.ok
      expect(configText.includes('node2')).to.be.ok
      expect(configText.includes('node3')).to.be.ok
    })

    it('should fail when no nodeIDs', () => {
      const nodeAccountMap = /** @type {Map<string, string>} */ new Map()
      expect(() => profileManager.prepareConfigTxt('', nodeAccountMap, '', version.HEDERA_PLATFORM_VERSION))
        .to.throw('nodeAccountMap the map of node IDs to account IDs is required')
    })

    it('should fail when no releaseTag is provided', () => {
      const nodeAccountMap = /** @type {Map<string, string>} */ new Map()
      nodeAccountMap.set('node1', '0.0.3')
      expect(() => profileManager.prepareConfigTxt('', nodeAccountMap, '', undefined))
        .to.throw('release tag is required')
    })

    it('should fail when destPath does not exist', () => {
      const nodeAccountMap = /** @type {Map<string, string>} */ new Map()
      nodeAccountMap.set('node1', '0.0.3')
      const destPath = path.join(tmpDir, 'missing-directory')
      try {
        profileManager.prepareConfigTxt('', nodeAccountMap, destPath, version.HEDERA_PLATFORM_VERSION)
      } catch (e) {
        expect(e.message).to.contain('config destPath does not exist')
        expect(e.message).to.contain(destPath)
      }
    })
  })
})
