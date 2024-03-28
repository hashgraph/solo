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
import { AccountBalanceQuery, AccountCreateTransaction, Hbar, PrivateKey } from '@hashgraph/sdk'
import {
  afterAll, beforeAll,
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
  getTestConfigManager,
  TEST_CLUSTER
} from '../../test_util.js'

describe.each([
  // { releaseTag: 'v0.47.0-alpha.0', keyFormat: constants.KEY_FORMAT_PFX, testName: 'node-cmd-e2e-pfx' },
  { releaseTag: 'v0.47.0-alpha.0', keyFormat: constants.KEY_FORMAT_PEM, testName: 'node-cmd-e2e-pem' }
])('NodeCommand', (input) => {
  const testName = input.testName
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = input.releaseTag
  argv[flags.keyFormat.name] = input.keyFormat
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  const bootstrapResp = bootstrapNetwork(testName, argv)
  const accountManager = bootstrapResp.opts.accountManager
  const k8 = bootstrapResp.opts.k8
  const nodeCmd = bootstrapResp.cmd.nodeCmd

  afterAll(async () => {
    // await k8.deleteNamespace(namespace)  // TODO renable this line
    await accountManager.close()
  })

  describe(`Node should start successfully [release ${input.releaseTag}, keyFormat: ${input.keyFormat}]`, () => {
    it('Balance query should succeed', async () => {
      expect.assertions(2)

      try {
        await accountManager.loadNodeClient(namespace)
        expect(accountManager._nodeClient).not.toBeNull()

        const balance = await new AccountBalanceQuery()
          .setAccountId(accountManager._nodeClient.getOperator().accountId)
          .execute(accountManager._nodeClient)

        expect(balance.hbars).not.toBeNull()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 120000)

    it('Account creation should succeed', async () => {
      expect.assertions(2)

      try {
        expect(accountManager._nodeClient).not.toBeNull()
        const accountKey = PrivateKey.generate()

        let transaction = await new AccountCreateTransaction()
          .setNodeAccountIds([constants.HEDERA_NODE_ACCOUNT_ID_START])
          .setInitialBalance(new Hbar(0))
          .setKey(accountKey.publicKey)
          .freezeWith(accountManager._nodeClient)

        transaction = await transaction.sign(accountKey)
        const response = await transaction.execute(accountManager._nodeClient)
        const receipt = await response.getReceipt(accountManager._nodeClient)

        expect(receipt.accountId).not.toBeNull()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      }
    }, 20000)

    it('Node Proxy should be UP', async () => {
      expect.assertions(1)

      try {
        await expect(nodeCmd.checkNetworkNodeProxyUp('node0', 30399)).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      } finally {
        await nodeCmd.close()
      }
    }, 20000)
  })

  describe(`Node should refresh successfully [release ${input.releaseTag}, keyFormat: ${input.keyFormat}]`, () => {
    let podName = ''
    beforeAll(async () => {
      argv[flags.nodeIDs.name] = 'node0'
      const configManager = getTestConfigManager(`${testName}-solo.config`)
      configManager.update(argv, true)

      const podArray = await k8.getPodsByLabel(['app=network-node0', 'fullstack.hedera.com/type=network-node'])

      if (podArray.length > 0) {
        podName = podArray[0].metadata.name
        const resp = await k8.kubeClient.deleteNamespacedPod(podName, namespace)
        expect(resp.response.statusCode).toEqual(200)
      } else {
        throw new Error('pod for node0 not found')
      }
    }, 20000)

    it('Node0 should be running', async () => {
      expect(podName).toContain('node0')
      try {
        await expect(nodeCmd.checkNetworkNodePod(namespace, 'node0')).resolves.toBeTruthy()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).toBeNull()
      } finally {
        await nodeCmd.close()
      }
    }, 20000)

    it('Node0 should not be ACTIVE', async () => {
      expect(3)
      expect(podName).toContain('node0')
      try {
        await expect(nodeCmd.stop(argv)).resolves.toBeTruthy()
        await expect(nodeCmd.checkNetworkNodeStarted('node0', 5)).rejects.toThrowError()
      } catch (e) {
        nodeCmd.logger.showUserError(e)
        expect(e).not.toBeNull()
      } finally {
        await nodeCmd.close()
      }
    }, 20000)

    it('Node0 refresh should succeed', async () => {
      await expect(nodeCmd.refresh(argv)).resolves.toBeTruthy()
    }, 1200000)
    // TODO need to test with PVCs
    // TODO will have changes when configMap/secrets are implemented
  })
})
