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
import { describe, expect, it } from '@jest/globals'
import path from 'path'
import { flags } from '../../../src/commands/index.mjs'
import { AccountManager } from '../../../src/core/account_manager.mjs'
import { ConfigManager, constants, K8 } from '../../../src/core/index.mjs'
import { getTestCacheDir, testLogger } from '../../test_util.js'

describe('AccountManager', () => {
  const configManager = new ConfigManager(testLogger, path.join(getTestCacheDir('accountCmd'), 'solo.config'))
  configManager.setFlag(flags.namespace, 'solo-e2e')

  const k8 = new K8(configManager, testLogger)
  const accountManager = new AccountManager(testLogger, k8, constants)

  it('should be able to stop port forwards', async () => {
    const podNames = new Map()
      .set('network-node0-svc', 20111)
      .set('network-node1-svc', 30111)
    const podPort = 50111
    const localHost = '127.0.0.1'

    expect(accountManager._portForwards.length).toStrictEqual(0)

    // ports should be opened
    for (const entry of podNames) {
      const podName = entry[0]
      const localPort = entry[1]
      accountManager._portForwards.push(await k8.portForward(podName, localPort, podPort))
      await expect(accountManager.testConnection(podName, localHost, localPort)).resolves.toBeTruthy()
    }

    await accountManager._stopPortForwards()

    // ports should be closed
    for (const entry of podNames) {
      const podName = entry[0]
      const localPort = entry[1]
      await expect(accountManager.testConnection(podName, localHost, localPort)).rejects
    }

    expect(accountManager._portForwards.length).toStrictEqual(0)
  })

  it('should be able to update special account keys', async () => {
    const resultTracker = {
      rejectedCount: 0,
      fulfilledCount: 0,
      skippedCount: 0
    }
    const accountsBatchedSet = accountManager.batchAccounts()
    const namespace = configManager.getFlag(flags.namespace)
    await accountManager.loadNodeClient(namespace)
    for (let i = 0; i < 3; i++) {
      const currentSet = accountsBatchedSet[i]
      await accountManager.updateSpecialAccountsKeys(namespace, currentSet, true, resultTracker)
    }
    await accountManager.close()
  }, 120000)
})
