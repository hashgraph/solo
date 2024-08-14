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
 * @jest-environment steps
 */
import {
  afterAll,
  describe
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
import { getNodeLogs } from '../../../src/core/helpers.mjs'

describe('Node local build', () => {
  const LOCAL_PTT = 'local-ptt-app'
  const argv = getDefaultArgv()
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PFX
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  argv[flags.valuesFile.name] = `test/data/${LOCAL_PTT}-values.yaml`

  let pttK8
  afterAll(async () => {
    await getNodeLogs(pttK8, LOCAL_PTT)
    await pttK8.deleteNamespace(LOCAL_PTT)
  }, 120000)

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
