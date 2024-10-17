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
import { it, describe, after, before } from 'mocha'
import { expect } from 'chai'

import { constants } from '../../../../src/core/index.ts'
import * as fs from 'fs'

import {
  e2eTestSuite,
  getDefaultArgv,
  getTestCacheDir,
  TEST_CLUSTER,
  testLogger
} from '../../../test_util.ts'
import { flags } from '../../../../src/commands/index.ts'
import * as version from '../../../../version.ts'
import { MINUTES, SECONDS } from '../../../../src/core/constants.ts'

const defaultTimeout = 20 * SECONDS

describe('PackageInstallerE2E', async () => {
  const namespace = 'pkg-installer-e2e'
  const argv = getDefaultArgv()
  const testCacheDir = getTestCacheDir()
  argv[flags.cacheDir.name] = testCacheDir
  argv[flags.namespace.name] = namespace
  argv[flags.nodeAliasesUnparsed.name] = 'node1'
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined
  const bootstrapResp = await e2eTestSuite(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, false)
  const k8 = bootstrapResp.opts.k8
  const accountManager = bootstrapResp.opts.accountManager
  const configManager = bootstrapResp.opts.configManager
  const installer = bootstrapResp.opts.platformInstaller
  const podName = 'network-node1-0'
  const packageVersion = 'v0.42.5'

  after(async function () {
    this.timeout(3 * MINUTES)

    await k8.deleteNamespace(namespace)
    await accountManager.close()
  })

  before(function () {
    this.timeout(defaultTimeout)

    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir)
    }
    configManager.load()
  })

  describe('fetchPlatform', () => {
    it('should fail with invalid pod', async () => {
      try {
        // @ts-ignore
        await installer.fetchPlatform('', packageVersion)
        throw new Error()
      } catch (e) {
        expect(e.message).to.include('podName is required')
      }

      try {
        // @ts-ignore
        await installer.fetchPlatform('INVALID', packageVersion)
      } catch (e) {
        expect(e.message).to.include('failed to extract platform code in this pod')
      }
    }).timeout(defaultTimeout)

    it('should fail with invalid tag', async () => {
      try {
        await installer.fetchPlatform(podName, 'INVALID')
        throw new Error()
      } catch (e) {
        expect(e.message).to.include('curl: (22) The requested URL returned error: 404')
      }
    }).timeout(defaultTimeout)

    it('should succeed with valid tag and pod', async () => {
      await expect(installer.fetchPlatform(podName, packageVersion)).to.eventually.be.ok
      const outputs = await k8.execContainer(podName, constants.ROOT_CONTAINER, `ls -la ${constants.HEDERA_HAPI_PATH}`)
      testLogger.showUser(outputs)
    }).timeout(MINUTES)
  })
})
