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
import { describe, it } from '@jest/globals'
import { bootstrapProperties } from '../../../src/commands/flags.mjs'
import { flags } from '../../../src/commands/index.mjs'
import { constants } from '../../../src/core/index.mjs'
import { bootstrapNetwork, bootstrapTestVariables, getDefaultArgv } from '../../test_util.js'

describe('Node add', () => {
  const TEST_NAMESPACE = 'node-add'
  const argv = getDefaultArgv()
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  argv[flags.nodeIDs.name] = 'node0,node1,node2'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  argv[flags.releaseTag] = 'v0.53.0-develop.xd2fbe98'

  argv[flags.namespace.name] = TEST_NAMESPACE
  // const bootstrapResp = bootstrapNetwork(TEST_NAMESPACE, argv)
  const bootstrapResp = bootstrapTestVariables(TEST_NAMESPACE, argv)
  const nodeCmd = bootstrapResp.cmd.nodeCmd

  // afterAll(async () => {
  //   await getNodeLogs(hederaK8, TEST_NAMESPACE)
  //   await hederaK8.deleteNamespace(TEST_NAMESPACE)
  // }, 120000)

  it('should add a new node to the network successfully', async () => {
    argv[flags.nodeID.name] = 'lenin-1'
    argv[flags.generateGossipKeys.name] = true
    argv[flags.generateTlsKeys.name] = true
    argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM

    await nodeCmd.add(argv)
  })
})
