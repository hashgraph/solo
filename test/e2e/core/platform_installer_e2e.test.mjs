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
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { constants, Templates } from '../../../src/core/index.mjs'
import * as fs from 'fs'

import {
  bootstrapNetwork,
  getDefaultArgv,
  getTestCacheDir, getTmpDir,
  TEST_CLUSTER,
  testLogger
} from '../../test_util.js'
import { flags } from '../../../src/commands/index.mjs'
import * as version from '../../../version.mjs'

const defaultTimeout = 20000

describe('PackageInstallerE2E', () => {
  const namespace = 'pkg-installer-e2e'
  const argv = getDefaultArgv()
  const testCacheDir = getTestCacheDir()
  argv[flags.cacheDir.name] = testCacheDir
  argv[flags.namespace.name] = namespace
  argv[flags.nodeIDs.name] = 'node1'
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  const bootstrapResp = bootstrapNetwork(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, false)
  const k8 = bootstrapResp.opts.k8
  const accountManager = bootstrapResp.opts.accountManager
  const configManager = bootstrapResp.opts.configManager
  const installer = bootstrapResp.opts.platformInstaller
  const podName = 'network-node1-0'
  const packageVersion = 'v0.42.5'

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
    await accountManager.close()
  }, 180000)

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

  describe('copyGossipKeys', () => {
    it('should succeed to copy legacy pfx gossip keys for node1', async () => {
      const podName = 'network-node1-0'
      const nodeId = 'node1'

      // generate pfx keys
      const pfxDir = 'test/data/pfx'
      await k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/data/keys/*`])
      const fileList = await installer.copyGossipKeys(podName, pfxDir, ['node1'], constants.KEY_FORMAT_PFX)

      const destDir = `${constants.HEDERA_HAPI_PATH}/data/keys`
      expect(fileList.length).toBe(2)
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPfxPrivateKeyFile(nodeId)}`)
      expect(fileList).toContain(`${destDir}/public.pfx`)
    }, 60000)

    it('should succeed to copy pem gossip keys for node1', async () => {
      const podName = 'network-node1-0'

      const pemDir = 'test/data/pem'
      await k8.execContainer(podName, constants.ROOT_CONTAINER, ['bash', '-c', `rm -f ${constants.HEDERA_HAPI_PATH}/data/keys/*`])
      const fileList = await installer.copyGossipKeys(podName, pemDir, ['node1'], constants.KEY_FORMAT_PEM)

      const destDir = `${constants.HEDERA_HAPI_PATH}/data/keys`
      expect(fileList.length).toBe(4)
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPemPrivateKeyFile(constants.SIGNING_KEY_PREFIX, 'node1')}`)
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPemPrivateKeyFile(constants.AGREEMENT_KEY_PREFIX, 'node1')}`)

      // public keys
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPemPublicKeyFile(constants.SIGNING_KEY_PREFIX, 'node1')}`)
      expect(fileList).toContain(`${destDir}/${Templates.renderGossipPemPublicKeyFile(constants.AGREEMENT_KEY_PREFIX, 'node1')}`)
    }, 60000)
  })

  describe('copyTLSKeys', () => {
    it('should succeed to copy TLS keys for node1', async () => {
      const nodeId = 'node1'
      const podName = Templates.renderNetworkPodName(nodeId)
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
})
