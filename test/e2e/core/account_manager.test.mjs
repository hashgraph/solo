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
import { flags } from '../../../src/commands/index.mjs'
import {
  bootstrapNetwork,
  getDefaultArgv,
  TEST_CLUSTER
} from '../../test_util.js'
import * as version from '../../../version.mjs'

describe('AccountManager', () => {
  const namespace = 'account-mngr-e2e'
  const argv = getDefaultArgv()
  argv[flags.namespace.name] = namespace
  argv[flags.nodeIDs.name] = 'node1'
  argv[flags.clusterName.name] = TEST_CLUSTER
  argv[flags.fstChartVersion.name] = version.FST_CHART_VERSION
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  const bootstrapResp = bootstrapNetwork(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, false)
  const k8 = bootstrapResp.opts.k8
  const accountManager = bootstrapResp.opts.accountManager
  const configManager = bootstrapResp.opts.configManager

  afterAll(async () => {
    await k8.deleteNamespace(namespace)
    await accountManager.close()
  }, 180000)

  it('should be able to stop port forwards', async () => {
    await accountManager.close()
    expect.assertions(4)
    const localHost = '127.0.0.1'

    const podName = 'minio-console' // use a svc that is less likely to be used by other tests
    const podPort = 9090
    const localPort = 19090

    expect(accountManager._portForwards.length, 'starting accountManager port forwards lengths should be zero').toStrictEqual(0)

    // ports should be opened
    accountManager._portForwards.push(await k8.portForward(podName, localPort, podPort))
    const status = await k8.testConnection(localHost, localPort)
    expect(status, 'test connection status should be true').toBeTruthy()

    // ports should be closed
    await accountManager.close()
    try {
      await k8.testConnection(localHost, localPort)
    } catch (e) {
      expect(e.message.includes(`failed to connect to '${localHost}:${localPort}'`), 'expect failed test connection').toBeTruthy()
    }

    expect(accountManager._portForwards.length, 'expect that the closed account manager should have no port forwards').toStrictEqual(0)
  })

  it('should be able to load a new client', async () => {
    await accountManager.loadNodeClient(configManager.getFlag(flags.namespace))
    expect(accountManager._nodeClient).not.toBeNull()
    await accountManager.close()
  })
})
