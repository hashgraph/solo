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
  const LOCAL_HEDERA = 'local-hedera-app'
  const argv = getDefaultArgv()
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined

  let hederaK8
  afterAll(async () => {
    await getNodeLogs(hederaK8, LOCAL_HEDERA)
    await hederaK8.deleteNamespace(LOCAL_HEDERA)
  }, 600000)

  describe('Node for hedera app should start successfully', () => {
    console.log('Starting local build for Hedera app')
    argv[flags.localBuildPath.name] = 'node0=../hedera-services/hedera-node/data/,../hedera-services/hedera-node/data,node2=../hedera-services/hedera-node/data'
    argv[flags.namespace.name] = LOCAL_HEDERA
    const bootstrapResp = bootstrapNetwork(LOCAL_HEDERA, argv)
    hederaK8 = bootstrapResp.opts.k8
  })
})
