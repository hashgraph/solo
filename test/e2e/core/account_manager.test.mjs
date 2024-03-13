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
    const localHost = '127.0.0.1'

    // map of svc -> local port
    const podName = 'minio-console' // use a svc that is less likely to be used by other tests
    const podPort = 9090
    const localPort = 19090

    expect(accountManager._portForwards.length).toStrictEqual(0)

    // ports should be opened
    accountManager._portForwards.push(await k8.portForward(podName, localPort, podPort))
    await expect(accountManager.testConnection(podName, localHost, localPort)).resolves.toBeTruthy()

    // ports should be closed
    await accountManager.close()
    await expect(accountManager.testConnection(podName, localHost, localPort)).rejects
    expect(accountManager._portForwards.length).toStrictEqual(0)
  })
})
