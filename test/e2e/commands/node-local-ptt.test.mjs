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
  afterAll, afterEach,
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

describe('Node local build', () => {
  const LOCAL_PTT = 'local-ptt-app'
  const argv = getDefaultArgv()
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PFX
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  let pttK8
  afterAll(async () => {
    await pttK8.deleteNamespace(LOCAL_PTT)
  }, 120000)

  describe('Node for platform app should start successfully', () => {
    console.log('Starting local build for Platform app')
    argv[flags.localBuildPath.name] = 'node0=../hedera-services/,node1=../hedera-services/,node2=../hedera-services/'
    argv[flags.pttTestConfig.name] = 'PlatformTestingTool.jar,../hedera-services/platform-sdk/platform-apps/tests/PlatformTestingTool/src/main/resources/FCMFCQ-Basic-2.5k-5m.json'
    argv[flags.namespace.name] = LOCAL_PTT
    const bootstrapResp = bootstrapNetwork(LOCAL_PTT, argv)
    pttK8 = bootstrapResp.opts.k8
  })
})
