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
import { it, describe, after } from 'mocha'
import { expect } from 'chai'

import { flags } from '../../../../src/commands/index.ts'
import { bootstrapTestVariables, e2eTestSuite, getDefaultArgv, TEST_CLUSTER } from '../../../test_util.ts'
import * as version from '../../../../version.ts'
import { MINUTES } from '../../../../src/core/constants.ts'
import type { PodName } from '../../../../src/types/aliases.ts'
import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  HbarUnit,
  Logger,
  LogLevel,
  PrivateKey, Status, TopicCreateTransaction, TopicMessageSubmitTransaction
} from '@hashgraph/sdk'

const namespace = 'account-mngr-e2e'
const argv = getDefaultArgv()
argv[flags.namespace.name] = namespace
argv[flags.nodeAliasesUnparsed.name] = 'node1'
argv[flags.clusterName.name] = TEST_CLUSTER
argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION
argv[flags.generateGossipKeys.name] = true
argv[flags.generateTlsKeys.name] = true
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined

e2eTestSuite(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, false, (bootstrapResp) => {
  describe('AccountManager', async () => {
    const k8 = bootstrapResp.opts.k8
    const accountManager = bootstrapResp.opts.accountManager
    const configManager = bootstrapResp.opts.configManager

    after(async function () {
      this.timeout(3 * MINUTES)

      await k8.deleteNamespace(namespace)
      await accountManager.close()
    })

    it('should be able to stop port forwards', async () => {
      await accountManager.close()
      const localHost = '127.0.0.1'

      const podName = 'minio-console' as PodName // use a svc that is less likely to be used by other tests
      const podPort = 9_090
      const localPort = 19_090

      // @ts-ignore
      expect(accountManager._portForwards, 'starting accountManager port forwards lengths should be zero').to.have.lengthOf(0)

      // ports should be opened
      // @ts-ignore
      accountManager._portForwards.push(await k8.portForward(podName, localPort, podPort))
      const status = await k8.testConnection(localHost, localPort)
      expect(status, 'test connection status should be true').to.be.ok

      // ports should be closed
      await accountManager.close()
      try {
        await k8.testConnection(localHost, localPort)
      } catch (e) {
        expect(e.message, 'expect failed test connection').to.include(`failed to connect to '${localHost}:${localPort}'`)
      }
      // @ts-ignore
      expect(accountManager._portForwards, 'expect that the closed account manager should have no port forwards').to.have.lengthOf(0)
    })

    it('should be able to load a new client', async () => {
      await accountManager.loadNodeClient(configManager.getFlag(flags.namespace))
      expect(accountManager._nodeClient).not.to.be.null
      await accountManager.close()
    })
  })

  describe('Test SDK create account and submit transaction', () => {
    const bootstrapResp = bootstrapTestVariables('Test transaction', argv)
    const accountManager = bootstrapResp.opts.accountManager
    const networkCmd = bootstrapResp.cmd.networkCmd

    let accountInfo: {
      accountId: string,
      privateKey: string,
      publicKey: string,
      balance: number }

    let MY_ACCOUNT_ID: string
    let MY_PRIVATE_KEY: string

    it('Create new account', async () => {
      try {
        await accountManager.loadNodeClient(namespace)
        const privateKey = PrivateKey.generate()
        const amount = 100

        const newAccount = await new AccountCreateTransaction()
        .setKey(privateKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient)

        // Get the new account ID
        const getReceipt = await newAccount.getReceipt(accountManager._nodeClient)
        accountInfo = {
          accountId: getReceipt.accountId.toString(),
          privateKey: privateKey.toString(),
          publicKey: privateKey.publicKey.toString(),
          balance: amount
        }

        MY_ACCOUNT_ID = accountInfo.accountId
        MY_PRIVATE_KEY = accountInfo.privateKey

        networkCmd.logger.info(`Account created: ${JSON.stringify(accountInfo)}`)
        expect(accountInfo.accountId).not.to.be.null
        expect(accountInfo.balance).to.equal(amount)
      } catch (e) {
        networkCmd.logger.showUserError(e)
      }
    }).timeout(2 * MINUTES)


    it('Create client from network config and submit topic/message should succeed', async () => {
      try {

        const networkConfig = {}
        networkConfig['127.0.0.1:30212'] = AccountId.fromString('0.0.3')
        networkConfig['127.0.0.1:30213'] = AccountId.fromString('0.0.4')

        const sdkClient = Client.fromConfig({ network: networkConfig, scheduleNetworkUpdate: false })
        sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY)
        sdkClient.setLogger(new Logger(LogLevel.Trace, 'hashgraph-sdk.log'))

        // Create a new public topic and submit a message
        const txResponse = await new TopicCreateTransaction().execute(sdkClient)
        const receipt = await txResponse.getReceipt(sdkClient)

        const submitResponse = await new TopicMessageSubmitTransaction({
          topicId: receipt.topicId,
          message: 'Hello, Hedera!'
        }).execute(accountManager._nodeClient)

        const submitReceipt = await submitResponse.getReceipt(accountManager._nodeClient)

        expect(submitReceipt.status).to.deep.equal(Status.Success)
      } catch (e) {
        networkCmd.logger.showUserError(e)
      }
    }).timeout(2 * MINUTES)
  })
})
