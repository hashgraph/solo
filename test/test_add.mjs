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
import { expect } from 'chai'
import { describe, it, after } from 'mocha'

import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  bootstrapNetwork,
  getDefaultArgv,
  getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG
} from './test_util.js'
import { flags } from '../src/commands/index.mjs'
import { getNodeLogs } from '../src/core/helpers.mjs'
import { NodeCommand } from '../src/commands/node.mjs'
import { MINUTES } from '../src/core/constants.mjs'

export function testNodeAdd (localBuildPath
) {
  describe('Node add should success', async () => {
    const suffix = localBuildPath.substring(0, 5)
    const defaultTimeout = 2 * MINUTES
    const namespace = 'node-add' + suffix
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
    argv[flags.localBuildPath.name] = localBuildPath
    argv[flags.quiet.name] = true

    const bootstrapResp = await bootstrapNetwork(namespace, argv)
    const nodeCmd = bootstrapResp.cmd.nodeCmd
    const accountCmd = bootstrapResp.cmd.accountCmd
    const networkCmd = bootstrapResp.cmd.networkCmd
    const k8 = bootstrapResp.opts.k8
    let existingServiceMap
    let existingNodeIdsPrivateKeysHash

    after(async function () {
      this.timeout(10 * MINUTES)

      await getNodeLogs(k8, namespace)
      await nodeCmd.accountManager.close()
      await nodeCmd.stop(argv)
      await networkCmd.destroy(argv)
      await k8.deleteNamespace(namespace)
    })

    it('cache current version of private keys', async () => {
      existingServiceMap = await nodeCmd.accountManager.getNodeServiceMap(namespace)
      existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(existingServiceMap, namespace, k8, getTmpDir())
    }).timeout(defaultTimeout)

    it('should succeed with init command', async () => {
      const status = await accountCmd.init(argv)
      expect(status).to.be.ok
    }).timeout(8 * MINUTES)

    it('should add a new node to the network successfully', async () => {
      await nodeCmd.add(argv)
      expect(nodeCmd.getUnusedConfigs(NodeCommand.ADD_CONFIGS_NAME)).to.deep.equal([
        flags.app.constName,
        flags.chainId.constName,
        flags.devMode.constName,
        flags.quiet.constName,
        flags.adminKey.constName
      ])
      await nodeCmd.accountManager.close()
    }).timeout(12 * MINUTES)

    balanceQueryShouldSucceed(nodeCmd.accountManager, nodeCmd, namespace)

    accountCreationShouldSucceed(nodeCmd.accountManager, nodeCmd, namespace)

    it('existing nodes private keys should not have changed', async () => {
      const currentNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(existingServiceMap, namespace, k8, getTmpDir())

      for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeAlias)

        for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
          expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.deep.equal(
            `${nodeAlias}:${keyFileName}:${existingKeyHash}`)
        }
      }
    }).timeout(defaultTimeout)
  })
}
