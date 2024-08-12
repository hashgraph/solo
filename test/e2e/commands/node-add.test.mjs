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
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { flags } from '../../../src/commands/index.mjs'
import { constants } from '../../../src/core/index.mjs'
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv, getNodeIdsPrivateKeysHash, getTestConfigManager, getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG
} from '../../test_util.js'
import { getNodeLogs } from '../../../src/core/helpers.mjs'
import { NodeCommand } from '../../../src/commands/node.mjs'

describe('Node add', () => {
  const defaultTimeout = 120000
  const namespace = 'node-add'
  const nodeId = 'node4'
  const argv = getDefaultArgv()
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  argv[flags.nodeIDs.name] = 'node1,node2,node3'
  argv[flags.nodeID.name] = nodeId
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.namespace.name] = namespace
  const bootstrapResp = bootstrapNetwork(namespace, argv)
  const nodeCmd = bootstrapResp.cmd.nodeCmd
  const accountCmd = bootstrapResp.cmd.accountCmd
  const k8 = bootstrapResp.opts.k8
  let existingServiceMap
  let existingNodeIdsPrivateKeysHash

  beforeAll(async () => {
    const configManager = getTestConfigManager(`${namespace}-solo.config`)
    configManager.update(argv, true)
    existingServiceMap = await nodeCmd.accountManager.getNodeServiceMap(namespace)
    existingNodeIdsPrivateKeysHash = await getNodeIdsPrivateKeysHash(existingServiceMap, namespace, constants.KEY_FORMAT_PEM, k8, getTmpDir())
  }, defaultTimeout)

  afterAll(async () => {
    await getNodeLogs(k8, namespace)
    await k8.deleteNamespace(namespace)
  }, defaultTimeout)

  it('should succeed with init command', async () => {
    const status = await accountCmd.init(argv)
    expect(status).toBeTruthy()
  }, 450000)

  it('should add a new node to the network successfully', async () => {
    await nodeCmd.add(argv)
    expect(nodeCmd.getUnusedConfigs(NodeCommand.ADD_CONFIGS_NAME)).toEqual([
      flags.apiPermissionProperties.constName,
      flags.applicationProperties.constName,
      flags.bootstrapProperties.constName,
      flags.chainId.constName,
      flags.devMode.constName,
      flags.log4j2Xml.constName,
      flags.settingTxt.constName
    ])
  }, 600000)

  balanceQueryShouldSucceed(nodeCmd.accountManager, nodeCmd, namespace)

  accountCreationShouldSucceed(nodeCmd.accountManager, nodeCmd, namespace)

  it('existing nodes private keys should not have changed', async () => {
    const currentNodeIdsPrivateKeysHash = await getNodeIdsPrivateKeysHash(existingServiceMap, namespace, constants.KEY_FORMAT_PEM, k8, getTmpDir())

    for (const [nodeId, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
      const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeId)

      for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
        expect(`${nodeId}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).toEqual(
            `${nodeId}:${keyFileName}:${existingKeyHash}`)
      }
    }
  }, defaultTimeout)
})
