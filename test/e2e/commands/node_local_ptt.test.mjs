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
 * @mocha-environment steps
 */
import { flags } from '../../../src/commands/index.mjs'
import { bootstrapNetwork, getDefaultArgv, TEST_CLUSTER } from '../../test_util.js'
import { getNodeLogs } from '../../../src/core/helpers.mjs'
import { MINUTES } from '../../../src/core/constants.mjs'

describe('Node local build', () => {
  const LOCAL_PTT = 'local-ptt-app'
  const argv = getDefaultArgv()
  argv[flags.nodeIDs.name] = 'node1,node2,node3'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ?? undefined
  argv[flags.quiet.name] = true

  /** @type {K8} */ let pttK8
  after(async function () {
    this.timeout(2 * MINUTES)

    await getNodeLogs(pttK8, LOCAL_PTT)
    await pttK8.deleteNamespace(LOCAL_PTT)
  })

  describe('Node for platform app should start successfully', () => {
    console.log('Starting local build for Platform app')
    argv[flags.localBuildPath.name] = '../hedera-services/platform-sdk/sdk/data,node1=../hedera-services/platform-sdk/sdk/data,node2=../hedera-services/platform-sdk/sdk/data'
    argv[flags.app.name] = 'PlatformTestingTool.jar'
    argv[flags.appConfig.name] = '../hedera-services/platform-sdk/platform-apps/tests/PlatformTestingTool/src/main/resources/FCMFCQ-Basic-2.5k-5m.json'
    argv[flags.namespace.name] = LOCAL_PTT
    const bootstrapResp = bootstrapNetwork(LOCAL_PTT, argv)
    pttK8 = bootstrapResp.opts.k8
  })
})
