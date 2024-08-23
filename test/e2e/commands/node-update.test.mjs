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
import { afterAll, describe, expect, it } from '@jest/globals'
import { flags } from '../../../src/commands/index.mjs'
import { constants } from '../../../src/core/index.mjs'
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv, getNodeIdsPrivateKeysHash, getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG
} from '../../test_util.js'
import { getNodeLogs } from '../../../src/core/helpers.mjs'
import { NodeCommand } from '../../../src/commands/node.mjs'
import path from 'path'

describe('Node add', () => {
  const defaultTimeout = 120000
  const namespace = 'node-update'
  const nodeId = 'node3'
  const argv = getDefaultArgv()
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  argv[flags.nodeIDs.name] = 'node1,node2,node3'
  argv[flags.nodeID.name] = nodeId

  argv[flags.newAccountNumber.name] = '0.0.7'
  argv[flags.newGRPCHash.name] = path.join('test', 'data', 'new_tls.crt')
  argv[flags.newCACertificate.name] = path.join('test', 'data', 'new_sign.pem')
  argv[flags.newAdminKey.name] = '302e020100300506032b6570042204200cde8d512569610f184b8b399e91e46899805c6171f7c2b8666d2a417bcc66c2'

  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  argv[flags.keyFormat.name] = constants.KEY_FORMAT_PEM
  // set the env variable SOLO_FST_CHARTS_DIR if developer wants to use local FST charts
  argv[flags.chartDirectory.name] = process.env.SOLO_FST_CHARTS_DIR ? process.env.SOLO_FST_CHARTS_DIR : undefined
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.namespace.name] = namespace
  argv[flags.persistentVolumeClaims.name] = true
  const bootstrapResp = bootstrapNetwork(namespace, argv)
  const nodeCmd = bootstrapResp.cmd.nodeCmd
  const accountCmd = bootstrapResp.cmd.accountCmd
  const k8 = bootstrapResp.opts.k8
  let existingServiceMap
  let existingNodeIdsPrivateKeysHash

  afterAll(async () => {
    await getNodeLogs(k8, namespace)
    await k8.deleteNamespace(namespace)
  }, 600000)

  it('cache current version of private keys', async () => {
    existingServiceMap = await nodeCmd.accountManager.getNodeServiceMap(namespace)
    existingNodeIdsPrivateKeysHash = await getNodeIdsPrivateKeysHash(existingServiceMap, namespace, constants.KEY_FORMAT_PEM, k8, getTmpDir())
  }, defaultTimeout)

  it('should succeed with init command', async () => {
    const status = await accountCmd.init(argv)
    expect(status).toBeTruthy()
  }, 450000)

  it('should update a new node property successfully', async () => {
    await nodeCmd.update(argv)
    expect(nodeCmd.getUnusedConfigs(NodeCommand.UPDATE_CONFIGS_NAME)).toEqual([
      flags.app.constName,
      flags.devMode.constName
    ])
    await nodeCmd.accountManager.close()
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
