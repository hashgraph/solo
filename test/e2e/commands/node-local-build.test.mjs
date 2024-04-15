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
  afterAll, afterEach,
  describe,
  expect,
  it
} from '@jest/globals'
import { flags } from '../../../src/commands/index.mjs'
import {
  constants
} from '../../../src/core/index.mjs'
import {
  bootstrapNetwork,
  getDefaultArgv,
  TEST_CLUSTER
} from '../../test_util.js'

describe('NodeCommand', () => {
  const testName = 'node-local-build'
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PFX
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.localBuildPath.name] = '../hedera-services/'
  const bootstrapResp = bootstrapNetwork(testName, argv)
  const accountManager = bootstrapResp.opts.accountManager
  const k8 = bootstrapResp.opts.k8
  const nodeCmd = bootstrapResp.cmd.nodeCmd

  afterEach(async () => {
    await nodeCmd.close()
    await accountManager.close()
  }, 120000)

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
  }, 120000)

  describe('Node should start successfully', () => {
    it('Node Proxy should be up', async () => {
      expect.assertions(1)
      try {
        await expect(nodeCmd.checkNetworkNodeProxyUp('node0', 30499)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      } finally {
        await nodeCmd.close()
      }
    }, 20000)
  })
})
