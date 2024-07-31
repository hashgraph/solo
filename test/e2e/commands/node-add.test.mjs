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
import { afterAll, describe, it } from '@jest/globals'
import { flags } from '../../../src/commands/index.mjs'
import { constants } from '../../../src/core/index.mjs'
import {
  bootstrapNetwork,
  getDefaultArgv,
  HEDERA_PLATFORM_VERSION_TAG
} from '../../test_util.js'
import { getNodeLogs } from '../../../src/core/helpers.mjs'

describe('Node add', () => {
  const TEST_NAMESPACE = 'node-add'
  const argv = getDefaultArgv()
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  argv[flags.nodeIDs.name] = 'node1,node2,node3'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  argv[flags.releaseTag] = HEDERA_PLATFORM_VERSION_TAG

  argv[flags.namespace.name] = TEST_NAMESPACE
  const bootstrapResp = bootstrapNetwork(TEST_NAMESPACE, argv)
  // const bootstrapResp = bootstrapTestVariables(TEST_NAMESPACE, argv)
  const nodeCmd = bootstrapResp.cmd.nodeCmd

  afterAll(async () => {
    await getNodeLogs(nodeCmd.k8, TEST_NAMESPACE)
  //   await hederaK8.deleteNamespace(TEST_NAMESPACE)
  }, 120000)

  it('should add a new node to the network successfully', async () => {
    argv[flags.nodeID.name] = 'node4' // TODO: open an issue: node ID cannot have a hyphen, platform strips it out, also, can't have capital letters
    argv[flags.generateGossipKeys.name] = true
    argv[flags.generateTlsKeys.name] = true
    argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM

    await nodeCmd.add(argv)
  }, 900000)

  // it('test', async () => {
  //   const addressBookPath = `${HEDERA_HAPI_PATH}/data/saved/address_book/`
  //   const output = await nodeCmd.k8.execContainer('network-node0-0', ROOT_CONTAINER,
  //     ['bash', '-c', `for file in ${addressBookPath}* ; do echo ; echo File: $file ; echo ; cat "$file" ; done`])
  //   console.log(output)
  // }, 120000)
})
