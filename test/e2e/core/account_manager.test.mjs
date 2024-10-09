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

import { flags } from '../../../src/commands/index.mjs'
import { bootstrapNetwork, getDefaultArgv, TEST_CLUSTER } from '../../test_util.js'
import * as version from '../../../version.mjs'
import { MINUTES } from '../../../src/core/constants.mjs'

describe('AccountManager', async () => {
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
  const bootstrapResp = bootstrapNetwork(namespace, argv, undefined, undefined, undefined, undefined, undefined, undefined, false)
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

    const podName = 'minio-console' // use a svc that is less likely to be used by other tests
    const podPort = 9_090
    const localPort = 19_090

    expect(accountManager._portForwards, 'starting accountManager port forwards lengths should be zero').to.have.lengthOf(0)

    // ports should be opened
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

    expect(accountManager._portForwards, 'expect that the closed account manager should have no port forwards').to.have.lengthOf(0)
  })

  it('should be able to load a new client', async () => {
    await accountManager.loadNodeClient(configManager.getFlag(flags.namespace))
    expect(accountManager._nodeClient).not.to.be.null
    await accountManager.close()
  })
})
