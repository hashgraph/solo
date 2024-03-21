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
import * as version from '../../../version.mjs'

describe('NetworkCommand', () => {
  const testName = 'solo-e2e'
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

  const networkCmd = bootstrapResp.cmd.networkCmd

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
    await accountManager.close()
  })

  it('solo network deploy should deploy three network nodes with defaults', async () => {
    expect.assertions(1)
    try {
      await expect(networkCmd.deploy(argv)).resolves.toBeTruthy()
    } catch (e) {
      networkCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)

  it('solo network destroy should destroy deployed network', async () => {
    argv[flags.deletePvcs.name] = true
    configManager.update(argv, true)

    expect.assertions(1)
    try {
      await expect(networkCmd.destroy(argv)).resolves.toBeTruthy()
    } catch (e) {
      networkCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)
})
