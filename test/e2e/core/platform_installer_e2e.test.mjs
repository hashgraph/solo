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
import { beforeAll, describe, expect, it } from '@jest/globals'
import {
  PlatformInstaller,
  constants,
  Templates,
  ConfigManager, Templates as Template
} from '../../../src/core/index.mjs'
import * as fs from 'fs'
import { K8 } from '../../../src/core/k8.mjs'

import { getTestCacheDir, getTmpDir, testLogger } from '../../test_util.js'
import { AccountManager } from '../../../src/core/account_manager.mjs'

const defaultTimeout = 20000

describe('PackageInstallerE2E', () => {
  const configManager = new ConfigManager(testLogger)
  const k8 = new K8(configManager, testLogger)
  const accountManager = new AccountManager(testLogger, k8)
  const installer = new PlatformInstaller(testLogger, k8, configManager, accountManager)
  const testCacheDir = getTestCacheDir()
  const podName = 'network-node0-0'
  const packageVersion = 'v0.42.5'

  beforeAll(async () => {
    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir)
    }

    configManager.load()
  }, defaultTimeout)

  describe('fetchPlatform', () => {
    it('should fail with invalid pod', async () => {
      expect.assertions(2)
      try {
        await installer.fetchPlatform('', packageVersion)
      } catch (e) {
        expect(e.message.includes('podName is required')).toBeTruthy()
      }

      try {
        await installer.fetchPlatform('INVALID', packageVersion)
      } catch (e) {
        expect(e.message
          .includes('failed to extract platform code in this pod'))
          .toBeTruthy()
      }
    }, defaultTimeout)

    it('should fail with invalid tag', async () => {
      expect.assertions(1)
      try {
        await installer.fetchPlatform(podName, 'INVALID')
      } catch (e) {
        expect(e.message.includes('curl: (22) The requested URL returned error: 404')).toBeTruthy()
      }
    }, defaultTimeout)

    it('should succeed with valid tag and pod', async () => {
      await expect(installer.fetchPlatform(podName, packageVersion)).resolves.toBeTruthy()
      const outputs = await k8.execContainer(podName, constants.ROOT_CONTAINER, `ls -la ${constants.HEDERA_HAPI_PATH}`)
      testLogger.showUser(outputs)
    }, 60000)
  })

  describe('prepareConfigTxt', () => {
    it('should succeed in generating config.txt', async () => {
      const tmpDir = getTmpDir()
      const configPath = `${tmpDir}/config.txt`
      const nodeIDs = ['node0']
      const chainId = '299'

      const configLines = await installer.prepareConfigTxt(nodeIDs, configPath, packageVersion, chainId)

      // verify format is correct
      expect(configLines.length).toBe(4)
      expect(configLines[0]).toBe(`swirld, ${chainId}`)
      expect(configLines[1]).toBe(`app, ${constants.HEDERA_APP_NAME}`)
      expect(configLines[2]).toContain('address, 0, node0, node0, 1')
      expect(configLines[3]).toBe('nextNodeId, 1')

      // verify the file exists
      expect(fs.existsSync(configPath)).toBeTruthy()
      const fileContents = fs.readFileSync(configPath).toString()

      // verify file content matches
      expect(fileContents).toBe(configLines.join('\n'))

      fs.rmSync(tmpDir, { recursive: true })
    }, defaultTimeout)
  })

  describe('copyGossipKeys', () => {
    it('should succeed to copy legacy pfx gossip keys for node0', async () => {
      const podName = 'network-node0-0'
      const nodeId = 'node0'

      // generate pfx keys
      const pfxDir = 'test/data/pfx'
      await k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/data/keys/*`])
      const fileList = await installer.copyGossipKeys(podName, pfxDir, ['node0'], constants.KEY_FORMAT_PFX)

      const destDir = `${constants.HEDERA_HAPI_PATH}/data/keys`
      expect(fileList.length).toBe(2)
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPfxPrivateKeyFile(nodeId)}`)
      expect(fileList).toContain(`${destDir}/public.pfx`)
    }, 60000)

    it('should succeed to copy pem gossip keys for node0', async () => {
      const podName = 'network-node0-0'

      const pemDir = 'test/data/pem'
      await k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/data/keys/*`])
      const fileList = await installer.copyGossipKeys(podName, pemDir, ['node0'], constants.KEY_FORMAT_PEM)

      const destDir = `${constants.HEDERA_HAPI_PATH}/data/keys`
      expect(fileList.length).toBe(4)
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, 'node0')}`)
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPemPrivateKeyFile(constants.AGREEMENT_KEY_PREFIX, 'node0')}`)

      // public keys
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, 'node0')}`)
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPemPublicKeyFile(constants.AGREEMENT_KEY_PREFIX, 'node0')}`)
    }, 60000)
  })

  describe('copyTLSKeys', () => {
    it('should succeed to copy TLS keys for node0', async () => {
      const nodeId = 'node0'
      const podName = Template.renderNetworkPodName(nodeId)
      const tmpDir = getTmpDir()

      // create mock files
      const pemDir = 'test/data/pem'
      await k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/hedera.*`])
      const fileList = await installer.copyTLSKeys(podName, pemDir)

      expect(fileList.length).toBe(2) // [data , hedera.crt, hedera.key]
      expect(fileList.length).toBeGreaterThanOrEqual(2)
      expect(fileList).toContain(`${constants.HEDERA_HAPI_PATH}/hedera.crt`)
      expect(fileList).toContain(`${constants.HEDERA_HAPI_PATH}/hedera.key`)

      fs.rmSync(tmpDir, { recursive: true })
    }, defaultTimeout)
  })

  describe('copyPlatformConfigFiles', () => {
    it('should succeed to copy platform config files for node0', async () => {
      const podName = 'network-node0-0'
      await k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/*.txt`])
      await k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/*.xml`])
      await k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/data/config/*.properties`])

      const tmpDir = getTmpDir()
      const nodeIDs = ['node0']
      const releaseTag = 'v0.42.0'

      fs.cpSync(`${constants.RESOURCES_DIR}/templates`, `${tmpDir}/templates`, { recursive: true })
      await installer.prepareConfigTxt(nodeIDs, `${tmpDir}/config.txt`, releaseTag, constants.HEDERA_CHAIN_ID, `${tmpDir}/templates/config.template`)

      const fileList = await installer.copyPlatformConfigFiles(podName, tmpDir)
      expect(fileList.length).toBeGreaterThanOrEqual(6)
      expect(fileList).toContain(`${constants.HEDERA_HAPI_PATH}/config.txt`)
      expect(fileList).toContain(`${constants.HEDERA_HAPI_PATH}/log4j2.xml`)
      expect(fileList).toContain(`${constants.HEDERA_HAPI_PATH}/settings.txt`)
      expect(fileList).toContain(`${constants.HEDERA_HAPI_PATH}/data/config/api-permission.properties`)
      expect(fileList).toContain(`${constants.HEDERA_HAPI_PATH}/data/config/application.properties`)
      expect(fileList).toContain(`${constants.HEDERA_HAPI_PATH}/data/config/bootstrap.properties`)
      fs.rmSync(tmpDir, { recursive: true })
    }, defaultTimeout)
  })
})
