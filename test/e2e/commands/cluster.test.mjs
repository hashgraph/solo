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
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals'
import {
  bootstrapTestVariables,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG,
  TEST_CLUSTER
} from '../../test_util.js'
import {
  constants,
  logging
} from '../../../src/core/index.mjs'
import { flags } from '../../../src/commands/index.mjs'
import { sleep } from '../../../src/core/helpers.mjs'
import * as version from '../../../version.mjs'

describe('ClusterCommand', () => {
  // mock showUser and showJSON to silent logging during tests
  jest.spyOn(logging.Logger.prototype, 'showUser').mockImplementation()
  jest.spyOn(logging.Logger.prototype, 'showJSON').mockImplementation()

  const testName = 'cluster-cmd-e2e'
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.nodeIDs.name] = 'node1'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.force.name] = true
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined

  const bootstrapResp = bootstrapTestVariables(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const configManager = bootstrapResp.opts.configManager
  const chartManager = bootstrapResp.opts.chartManager

  const clusterCmd = bootstrapResp.cmd.clusterCmd

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
    argv[flags.clusterSetupNamespace.name] = constants.SOLO_SETUP_NAMESPACE
    configManager.update(argv, true)
    await clusterCmd.setup(argv) // restore fullstack-cluster-setup for other e2e tests to leverage
    do {
      await sleep(5000)
    } while (!await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART))
  }, 180000)

  beforeEach(() => {
    configManager.reset()
  })

  afterEach(async () => {
    await sleep(5) // give a few ticks so that connections can close
  })

  it('should cleanup existing deployment', async () => {
    if (await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART)) {
      expect.assertions(1)
      try {
        await expect(clusterCmd.reset(argv)).resolves.toBeTruthy()
      } catch (e) {
        expect(e).toBeNull()
      }
    }
  }, 60000)

  it('solo cluster setup should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID'
    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(clusterCmd.setup(argv)).rejects.toThrowError('Error on cluster setup')
    } catch (e) {
      expect(e).toBeNull()
    }
  }, 60000)

  it('solo cluster setup should work with valid args', async () => {
    argv[flags.clusterSetupNamespace.name] = namespace
    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(clusterCmd.setup(argv)).resolves.toBeTruthy()
    } catch (e) {
      expect(e).toBeNull()
    }
  }, 60000)

  it('function getClusterInfo should return true', async () => {
    try {
      await expect(clusterCmd.getClusterInfo()).resolves.toBeTruthy()
    } catch (e) {
      expect(e).toBeNull()
    }
  }, 60000)

  it('function showClusterList should return right true', async () => {
    try {
      await expect(clusterCmd.showClusterList()).resolves.toBeTruthy()
    } catch (e) {
      expect(e).toBeNull()
    }
  }, 60000)

  it('function showInstalledChartList should return right true', async () => {
    try {
      await expect(clusterCmd.showInstalledChartList()).resolves.toBeUndefined()
    } catch (e) {
      expect(e).toBeNull()
    }
  }, 60000)

  // helm list would return an empty list if given invalid namespace
  it('solo cluster reset should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID'
    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(clusterCmd.reset(argv)).rejects.toThrowError('Error on cluster reset')
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)

  it('solo cluster reset should work with valid args', async () => {
    argv[flags.clusterSetupNamespace.name] = namespace
    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(clusterCmd.reset(argv)).resolves.toBeTruthy()
    } catch (e) {
      expect(e).toBeNull()
    }
  }, 60000)
})
