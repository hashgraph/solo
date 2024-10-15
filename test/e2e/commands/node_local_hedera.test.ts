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
import { describe, after } from 'mocha'

import { flags } from '../../../src/commands/index.ts'
import {
  bootstrapNetwork,
  getDefaultArgv,
  TEST_CLUSTER
} from '../../test_util.ts'
import { getNodeLogs } from '../../../src/core/helpers.ts'
import { MINUTES } from '../../../src/core/constants.ts'
import { K8 } from '../../../src/core/index.ts'

describe('Node local build', () => {
  const LOCAL_HEDERA = 'local-hedera-app'
  const argv = getDefaultArgv()
  argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.clusterName.name] = TEST_CLUSTER
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined
  argv[flags.quiet.name] = true

  let hederaK8: K8
  after(async function () {
    this.timeout(10 * MINUTES)
    await getNodeLogs(hederaK8, LOCAL_HEDERA)
    await hederaK8.deleteNamespace(LOCAL_HEDERA)
  })

  describe('Node for hedera app should start successfully', async () => {
    console.log('Starting local build for Hedera app')
    argv[flags.localBuildPath.name] = 'node1=../hedera-services/hedera-node/data/,../hedera-services/hedera-node/data,node3=../hedera-services/hedera-node/data'
    argv[flags.namespace.name] = LOCAL_HEDERA
    const bootstrapResp = await bootstrapNetwork(LOCAL_HEDERA, argv)
    hederaK8 = bootstrapResp.opts.k8
  })
})
