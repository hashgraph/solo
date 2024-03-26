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
  it
} from '@jest/globals'
import {
  bootstrapTestVariables,
  getDefaultArgv,
  TEST_CLUSTER
} from '../../test_util.js'
import {
  constants
} from '../../../src/core/index.mjs'
import { flags } from '../../../src/commands/index.mjs'
import { sleep } from '../../../src/core/helpers.mjs'
import * as version from '../../../version.mjs'

describe('ClusterCommand', () => {
  const testName = 'cluster-cmd-e2e'
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = 'v0.47.0-alpha.0'
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.force.name] = true

  const bootstrapResp = bootstrapTestVariables(testName, argv)
  const k8 = bootstrapResp.opts.k8
  const accountManager = bootstrapResp.opts.accountManager
  const configManager = bootstrapResp.opts.configManager
  const chartManager = bootstrapResp.opts.chartManager

  const clusterCmd = bootstrapResp.cmd.clusterCmd

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
    await accountManager.close()
  })

  beforeEach(() => {
    configManager.reset()
  })

  afterEach(async () => {
    await sleep(5) // give a few ticks so that connections can close
  })

  it('should cleanup existing deployment', async () => {
    if (await chartManager.isChartInstalled(constants.FULLSTACK_SETUP_NAMESPACE, constants.FULLSTACK_CLUSTER_SETUP_CHART)) {
      expect.assertions(1)
      try {
        await expect(clusterCmd.reset(argv)).resolves.toBeTruthy()
      } catch (e) {
        clusterCmd.logger.showUserError(e)
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
      clusterCmd.logger.showUserError(e)
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
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)

  it('function getClusterInfo should return true', async () => {
    try {
      await expect(clusterCmd.getClusterInfo()).resolves.toBeTruthy()
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)

  it('function showClusterList should return right true', async () => {
    try {
      await expect(clusterCmd.showClusterList()).resolves.toBeTruthy()
    } catch (e) {
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)

  it('function showInstalledChartList should return right true', async () => {
    try {
      await expect(clusterCmd.showInstalledChartList()).resolves.toBeUndefined()
    } catch (e) {
      clusterCmd.logger.showUserError(e)
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
      clusterCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)
})
