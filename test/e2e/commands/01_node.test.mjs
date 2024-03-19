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
  afterAll,
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

describe.each([
  // ['v0.42.5', constants.KEY_FORMAT_PFX]
  ['v0.47.0-alpha.0', constants.KEY_FORMAT_PFX],
  ['v0.47.0-alpha.0', constants.KEY_FORMAT_PEM]
])('NodeCommand', (testRelease, testKeyFormat) => {
  const testName = 'node-cmd-e2e'
  const namespace = testName
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.releaseTag.name] = testRelease
  argv[flags.keyFormat.name] = testKeyFormat
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  const bootstrapResp = bootstrapNetwork(testName, argv)
  const accountManager = bootstrapResp.opts.accountManager
  const k8 = bootstrapResp.opts.k8
  const nodeCmd = bootstrapResp.cmd.nodeCmd

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
    await accountManager.close()
  })

  describe(`Node should start successfully [release ${testRelease}, keyFormat: ${testKeyFormat}]`, () => {
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
  })
})
