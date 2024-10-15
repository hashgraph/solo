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
import { it, describe, after } from 'mocha'
import { expect } from 'chai'

import { flags } from '../../../src/commands/index'
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv,
  getNodeAliasesPrivateKeysHash, getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG
} from '../../test_util'
import { getNodeLogs } from '../../../src/core/helpers'
import { NodeCommand } from '../../../src/commands/node'
import { MINUTES } from '../../../src/core/constants'

describe('Node add via separated commands should success', async () => {
  const defaultTimeout = 2 * MINUTES
  const namespace = 'node-add-separated'
  const argv = getDefaultArgv()
  argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3'
  argv[flags.generateGossipKeys.name] = true
  argv[flags.generateTlsKeys.name] = true
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG
  argv[flags.namespace.name] = namespace
  argv[flags.force.name] = true
  argv[flags.persistentVolumeClaims.name] = true
  argv[flags.quiet.name] = true

  const argvPrepare = Object.assign({}, argv)

  const tempDir = 'contextDir'
  argvPrepare[flags.outputDir.name] = tempDir

  const argvExecute = getDefaultArgv()
  argvExecute[flags.inputDir.name] = tempDir

  const bootstrapResp = await bootstrapNetwork(namespace, argv)
  const nodeCmd = bootstrapResp.cmd.nodeCmd

  // @ts-ignore in order to access the private member
  const accountManager = nodeCmd.accountManager

  const accountCmd = bootstrapResp.cmd.accountCmd
  const networkCmd = bootstrapResp.cmd.networkCmd
  const k8 = bootstrapResp.opts.k8
  let existingServiceMap
  let existingNodeIdsPrivateKeysHash

  after(async function () {
    this.timeout(10 * MINUTES)

    await getNodeLogs(k8, namespace)
    await accountManager.close()
    await nodeCmd.stop(argv)
    await networkCmd.destroy(argv)
    await k8.deleteNamespace(namespace)
  })

  it('cache current version of private keys', async () => {
    existingServiceMap = await accountManager.getNodeServiceMap(namespace)
    existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(existingServiceMap, namespace, k8, getTmpDir())
  }).timeout(defaultTimeout)

  it('should succeed with init command', async () => {
    const status = await accountCmd.init(argv)
    expect(status).to.be.ok
  }).timeout(8 * MINUTES)

  it('should add a new node to the network via the segregated commands successfully', async () => {
    await nodeCmd.addPrepare(argvPrepare)
    await nodeCmd.addSubmitTransactions(argvExecute)
    await nodeCmd.addExecute(argvExecute)
    expect(nodeCmd.getUnusedConfigs(NodeCommand.ADD_CONFIGS_NAME)).to.deep.equal([
      flags.app.constName,
      flags.chainId.constName,
      flags.devMode.constName,
      flags.generateGossipKeys.constName,
      flags.generateTlsKeys.constName,
      flags.gossipEndpoints.constName,
      flags.grpcEndpoints.constName,
      flags.quiet.constName,
      flags.adminKey.constName,
      'curDate',
      'freezeAdminPrivateKey'
    ])
    await accountManager.close()
  }).timeout(12 * MINUTES)

  balanceQueryShouldSucceed(accountManager, nodeCmd, namespace)

  accountCreationShouldSucceed(accountManager, nodeCmd, namespace)

  it('existing nodes private keys should not have changed', async () => {
    const currentNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(existingServiceMap, namespace, k8, getTmpDir())

    for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
      const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeAlias)

      for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
        expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.equal(
            `${nodeAlias}:${keyFileName}:${existingKeyHash}`)
      }
    }
  }).timeout(defaultTimeout)
}).timeout(3 * MINUTES)
