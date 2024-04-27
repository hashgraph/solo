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
  AccountBalanceQuery,
  AccountCreateTransaction,
  Hbar,
  HbarUnit,
  PrivateKey
} from '@hashgraph/sdk'
import {
  afterAll, afterEach,
  beforeAll,
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
import { sleep } from '../../../src/core/helpers.mjs'

describe.each([
  { releaseTag: 'v0.49.0-alpha.2', keyFormat: constants.KEY_FORMAT_PFX, testName: 'node-cmd-e2e-pfx', mode: 'kill' },
  { releaseTag: 'v0.49.0-alpha.2', keyFormat: constants.KEY_FORMAT_PEM, testName: 'node-cmd-e2e-pem', mode: 'stop' }
])('NodeCommand', (input) => {
  const testName = input.testName
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = input.releaseTag
  argv[flags.keyFormat.name] = input.keyFormat
  argv[flags.nodeIDs.name] = 'node0,node1,node2,node3'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
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

  describe(`Node should start successfully [mode ${input.mode}, release ${input.releaseTag}, keyFormat: ${input.keyFormat}]`, () => {
    balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

    accountCreationShouldSucceed(accountManager, nodeCmd, namespace)

    it(`Node Proxy should be UP [mode ${input.mode}, release ${input.releaseTag}, keyFormat: ${input.keyFormat}`, async () => {
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

  describe.skip(`Node should refresh successfully [mode ${input.mode}, release ${input.releaseTag}, keyFormat: ${input.keyFormat}]`, () => {
    const nodeId = 'node0'

    beforeAll(async () => {
      const podName = await nodeRefreshTestSetup(argv, testName, k8, nodeId)
      if (input.mode === 'kill') {
        const resp = await k8.kubeClient.deleteNamespacedPod(podName, namespace)
        expect(resp.response.statusCode).toEqual(200)
        await sleep(20000) // sleep to wait for pod to finish terminating
      } else if (input.mode === 'stop') {
        await expect(nodeCmd.stop(argv)).resolves.toBeTruthy()
        await sleep(20000) // give time for node to stop and update its logs
      } else {
        throw new Error(`invalid mode: ${input.mode}`)
      }
    }, 120000)

    nodePodShouldBeRunning(nodeCmd, namespace, nodeId)

    nodeShouldNotBeActive(nodeCmd, nodeId)

    nodeRefreshShouldSucceed(nodeId, nodeCmd, argv)

    balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

    accountCreationShouldSucceed(accountManager, nodeCmd, namespace)
  })
})

function accountCreationShouldSucceed (accountManager, nodeCmd, namespace) {
  it('Account creation should succeed', async () => {
    expect.assertions(3)

    try {
      await accountManager.loadNodeClient(namespace)
      expect(accountManager._nodeClient).not.toBeNull()
      const privateKey = PrivateKey.generate()
      const amount = 100

      const newAccount = await new AccountCreateTransaction()
        .setKey(privateKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient)

      // Get the new account ID
      const getReceipt = await newAccount.getReceipt(accountManager._nodeClient)
      const accountInfo = {
        accountId: getReceipt.accountId.toString(),
        privateKey: privateKey.toString(),
        publicKey: privateKey.publicKey.toString(),
        balance: amount
      }

      expect(accountInfo.accountId).not.toBeNull()
      expect(accountInfo.balance).toEqual(amount)
    } catch (e) {
      nodeCmd.logger.showUserError(e)
      expect(e).toBeNull()
    }
  }, 60000)
}

function balanceQueryShouldSucceed (accountManager, nodeCmd, namespace) {
  it('Balance query should succeed', async () => {
    expect.assertions(3)

    try {
      expect(accountManager._nodeClient).toBeNull()
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
    await sleep(1000)
  }, 120000)
}

function nodePodShouldBeRunning (nodeCmd, namespace, nodeId) {
  it(`${nodeId} should be running`, async () => {
    try {
      await expect(nodeCmd.checkNetworkNodePod(namespace, nodeId)).resolves.toBeTruthy()
    } catch (e) {
      nodeCmd.logger.showUserError(e)
      expect(e).toBeNull()
    } finally {
      await nodeCmd.close()
    }
  }, 20000)
}

function nodeRefreshShouldSucceed (nodeId, nodeCmd, argv) {
  it(`${nodeId} refresh should succeed`, async () => {
    try {
      await expect(nodeCmd.refresh(argv)).resolves.toBeTruthy()
    } catch (e) {
      nodeCmd.logger.showUserError(e)
      expect(e).toBeNull()
    } finally {
      await nodeCmd.close()
      await sleep(10000) // sleep to wait for node to finish starting
    }
  }, 1200000)
}

function nodeShouldNotBeActive (nodeCmd, nodeId) {
  it(`${nodeId} should not be ACTIVE`, async () => {
    expect(2)
    try {
      await expect(nodeCmd.checkNetworkNodeStarted(nodeId, 5)).rejects.toThrowError()
    } catch (e) {
      nodeCmd.logger.showUserError(e)
      expect(e).not.toBeNull()
    } finally {
      await nodeCmd.close()
    }
  }, 20000)
}

async function nodeRefreshTestSetup (argv, testName, k8, nodeId) {
  argv[flags.nodeIDs.name] = nodeId
  const configManager = getTestConfigManager(`${testName}-solo.config`)
  configManager.update(argv, true)

  const podArray = await k8.getPodsByLabel(
    [`app=network-${nodeId}`, 'fullstack.hedera.com/type=network-node'])

  if (podArray.length > 0) {
    const podName = podArray[0].metadata.name
    k8.logger.info(`nodeRefreshTestSetup: podName: ${podName}`)
    return podName
  } else {
    throw new Error(`pod for ${nodeId} not found`)
  }
}
